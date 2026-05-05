import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ProgressBar from '../components/ProgressBar'
import Timer from '../components/Timer'
import Task1Reading from './tasks/Task1Reading'
import Task2Writing from './tasks/Task2Writing'
import Task3Listening from './tasks/Task3Listening'
import Task4Speaking from './tasks/Task4Speaking'
import { scenarioApi, attemptApi } from '../api/client'
import { useCountdown } from '../hooks/useCountdown'

interface Material {
  id: string
  material_type: string
  content: string | null
  storage_key: string | null
}

interface Task {
  id: string
  scenario_id: string
  title: string
  description: string | null
  task_type: 'reading' | 'writing' | 'listening' | 'speaking'
  sequence_order: number
  time_limit_seconds: number | null
  materials: Material[]
}

interface SpeakingQuestion {
  id: string
  order: number
  question: string
  timeLimitSeconds: number
}

const S3_BASE = 'http://localhost:9000/lcca-artifacts'

function getMaterial(task: Task, type: string): Material | undefined {
  return task.materials?.find((m) => m.material_type === type)
}

function getAudioUrl(task: Task): string {
  const m = getMaterial(task, 'audio')
  if (!m) return ''
  if (m.content) return m.content
  if (m.storage_key) return `${S3_BASE}/${m.storage_key}`
  return ''
}

export default function ScenarioRunner() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()

  const [scenarioTitle, setScenarioTitle] = useState<string>('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [taskResponseIds, setTaskResponseIds] = useState<Record<number, string>>({})
  const [taskStatuses, setTaskStatuses] = useState<Record<number, string>>({})
  const [taskContents, setTaskContents] = useState<Record<number, string>>({})
  const [taskStartMs, setTaskStartMs] = useState<Record<number, number>>({}) // unix ms when task became active
  const [taskPausedRemaining, setTaskPausedRemaining] = useState<Record<number, number>>({}) // saved remaining seconds on pause
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentTask = tasks[currentTaskIndex]
  // Default to 90 minutes if not specified
  const totalSeconds = 90 * 60

  const {
    seconds,
    formatted,
    isRunning,
    isWarning,
    start,
    pause,
  } = useCountdown({
    initialSeconds: totalSeconds,
    onComplete: handleTimeUp,
    onWarning: (remaining) => {
      console.log('Warning: Time is running out!', remaining)
    },
    warningThreshold: 300,
  })

  useEffect(() => {
    if (scenarioId) {
      loadScenarioData()
    }
  }, [scenarioId])

  const loadScenarioData = async () => {
    setIsLoading(true)
    try {
      const scenarioResponse = await scenarioApi.get(scenarioId!)
      setScenarioTitle(scenarioResponse.data.title || '')
      const rawTasks: Task[] = scenarioResponse.data.tasks || []
      setTasks(rawTasks)

      // Create attempt (returns existing if in-progress, 409 if already submitted)
      let aid = ''
      try {
        const attemptResponse = await attemptApi.create(scenarioId!)
        aid = attemptResponse.data.id
        setAttemptId(aid)
      } catch (err: any) {
        if (err?.response?.status === 409) {
          navigate('/', { state: { submitted: true } })
          return
        }
        throw err
      }
      if (!aid) return

      // Initialize task statuses
      const initialStatuses: Record<number, string> = {}
      rawTasks.forEach((_: Task, index: number) => {
        initialStatuses[index] = 'not_started'
      })
      setTaskStatuses(initialStatuses)

      // Start attempt — if already submitted, the status comes back as 'submitted'
      const startRes = await attemptApi.start(aid)
      if (startRes.data.status !== 'in_progress') {
        alert('You have already submitted this exam.')
        navigate('/')
        return
      }

      // Load task response IDs from backend
      await loadTaskResponses(aid, rawTasks)

      // Mark first task as in_progress and record its start time
      setTaskStatuses((prev) => ({ ...prev, 0: 'in_progress' }))
      setTaskStartMs((prev) => ({ ...prev, 0: Date.now() }))

      start()
    } catch (error) {
      console.error('Failed to load scenario:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadTaskResponses = async (aid: string, taskList: Task[]) => {
    try {
      const res = await fetch(`/api/v1/attempts/${aid}/responses`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })
      const data = await res.json()
      const items: { id: string; task_id: string; status: string; content?: string }[] = data.items || []

      const newIds: Record<number, string> = {}
      const newStatuses: Record<number, string> = {}
      const newContents: Record<number, string> = {}
      taskList.forEach((task: Task, index: number) => {
        const found = items.find((r) => r.task_id === task.id)
        if (found) {
          newIds[index] = found.id
          newStatuses[index] = found.status === 'submitted' ? 'completed' : found.status
          if (found.content) {
            newContents[index] = found.content
          }
        }
      })
      setTaskResponseIds((prev) => ({ ...prev, ...newIds }))
      setTaskStatuses((prev) => ({ ...prev, ...newStatuses }))
      setTaskContents((prev) => ({ ...prev, ...newContents }))
    } catch (error) {
      console.error('Failed to load task responses:', error)
    }
  }

  const saveTaskResponse = async (taskIndex: number, content: string) => {
    const responseId = taskResponseIds[taskIndex]
    if (!responseId || !attemptId) return

    setTaskContents((prev) => ({ ...prev, [taskIndex]: content }))

    try {
      await fetch(`/api/v1/attempts/${attemptId}/responses/${responseId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({ content }),
      })
    } catch (error) {
      console.error('Failed to save task response:', error)
    }
  }

  const handleTaskSubmit = async (taskIndex: number) => {
    const responseId = taskResponseIds[taskIndex]
    if (!responseId || !attemptId) return

    try {
      // Force-flush any unsaved content before submitting so the backend has the latest value
      const currentContent = taskContents[taskIndex]
      if (currentContent !== undefined) {
        await fetch(`/api/v1/attempts/${attemptId}/responses/${responseId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
          body: JSON.stringify({ content: currentContent }),
        })
      }

      await fetch(`/api/v1/attempts/${attemptId}/responses/${responseId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      })

      setTaskStatuses((prev) => ({ ...prev, [taskIndex]: 'completed' }))

      const nextIndex = taskIndex + 1
      if (nextIndex < tasks.length) {
        setTaskStatuses((prev) => ({ ...prev, [nextIndex]: 'in_progress' }))
        setTaskStartMs((prev) => ({ ...prev, [nextIndex]: Date.now() }))
        setCurrentTaskIndex(nextIndex)
      } else {
        // All tasks done — submit the entire attempt automatically
        await handleSubmitAll()
      }
    } catch (error) {
      console.error('Failed to submit task:', error)
    }
  }

  function handleTimeUp() {
    handleSubmitAll()
  }

  const handleSubmitAll = async () => {
    if (isSubmitting || !attemptId) return

    setIsSubmitting(true)
    try {
      await attemptApi.submit(attemptId, true)
      navigate(`/result/${attemptId}`)
    } catch (error) {
      console.error('Failed to submit exam:', error)
      alert('Failed to submit. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const getTimeRemaining = (taskIndex: number): number | undefined => {
    const task = tasks[taskIndex]
    if (!task?.time_limit_seconds) return undefined
    // Use saved paused value if available (takes priority over wall-clock)
    if (taskPausedRemaining[taskIndex] !== undefined) return taskPausedRemaining[taskIndex]
    const startMs = taskStartMs[taskIndex]
    if (!startMs) return task.time_limit_seconds
    const elapsed = (Date.now() - startMs) / 1000
    return Math.floor(Math.max(0, task.time_limit_seconds - elapsed))
  }

  const handleTaskClick = (taskId: string) => {
    const taskIndex = tasks.findIndex((t) => t.id === taskId)
    if (taskIndex !== -1 && taskStatuses[taskIndex] !== 'not_started') {
      // Record start time only if first time entering this task
      if (!taskStartMs[taskIndex]) {
        setTaskStartMs((prev) => ({ ...prev, [taskIndex]: Date.now() }))
      }
      setCurrentTaskIndex(taskIndex)
    }
  }

  const progressTasks = tasks.map((task, index) => ({
    id: task.id,
    title: task.title,
    type: task.task_type,
    status: (taskStatuses[index] as any) || 'not_started',
  }))

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading assessment...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">{scenarioTitle}</h1>
          </div>

          <Timer
            formatted={formatted}
            seconds={seconds}
            isWarning={isWarning}
            isRunning={isRunning}
            onPause={pause}
            onResume={start}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 flex gap-6">
        {/* Sidebar */}
        <aside className="w-72 flex-shrink-0">
          <ProgressBar
            tasks={progressTasks}
            currentTaskId={currentTask?.id}
            onTaskClick={handleTaskClick}
          />

          <div className="mt-4">
            <button
              onClick={handleSubmitAll}
              disabled={isSubmitting}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium
                hover:bg-green-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed
                flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Submit All & Finish
                </>
              )}
            </button>
          </div>
        </aside>

        {/* Task Content */}
        <div className="flex-1 bg-white rounded-lg border border-gray-200 p-6 overflow-hidden">
          {currentTask?.task_type === 'reading' && (
            <Task1Reading
              advertisement={{
                title: currentTask.title,
                body: getMaterial(currentTask, 'advertisement')?.content || currentTask.description || '',
              }}
              attemptId={attemptId!}
              taskId={currentTask.id}
              taskIndex={currentTaskIndex}
              initialContent={taskContents[currentTaskIndex] || ''}
              timeLimit={currentTask.time_limit_seconds ?? undefined}
              initialTimeRemaining={getTimeRemaining(currentTaskIndex)}
              onSubmit={() => handleTaskSubmit(currentTaskIndex)}
              saveResponse={saveTaskResponse}
              onContentChange={(content) =>
                setTaskContents((prev) => ({ ...prev, [currentTaskIndex]: content }))
              }
              onTimerPause={(remaining) =>
                setTaskPausedRemaining((prev) => ({ ...prev, [currentTaskIndex]: remaining }))
              }
            />
          )}

          {currentTask?.task_type === 'writing' && (
            <Task2Writing
              referenceMaterials={{
                resume: getMaterial(currentTask, 'resume')?.content || undefined,
                job_description: getMaterial(currentTask, 'job_description')?.content || currentTask.description || '',
                notes: getMaterial(currentTask, 'notes')?.content || undefined,
              }}
              wordLimit={{ min: 150, max: 300 }}
              attemptId={attemptId!}
              taskId={currentTask.id}
              taskIndex={currentTaskIndex}
              initialContent={taskContents[currentTaskIndex] || ''}
              timeLimit={currentTask.time_limit_seconds ?? undefined}
              initialTimeRemaining={getTimeRemaining(currentTaskIndex)}
              onSubmit={() => handleTaskSubmit(currentTaskIndex)}
              saveResponse={saveTaskResponse}
              onContentChange={(content) =>
                setTaskContents((prev) => ({ ...prev, [currentTaskIndex]: content }))
              }
              onTimerPause={(remaining) =>
                setTaskPausedRemaining((prev) => ({ ...prev, [currentTaskIndex]: remaining }))
              }
            />
          )}

          {currentTask?.task_type === 'listening' && (() => {
            let listeningNotes = ''
            const raw = taskContents[currentTaskIndex]
            if (raw) {
              try { listeningNotes = JSON.parse(raw).notes || raw } catch { listeningNotes = raw }
            }
            return (
              <Task3Listening
                attemptId={attemptId!}
                taskId={currentTask.id}
                audioUrl={getAudioUrl(currentTask)}
                audioDuration={180}
                timeLimit={currentTask.time_limit_seconds || 900}
                initialNotes={listeningNotes}
                initialTimeRemaining={getTimeRemaining(currentTaskIndex)}
                onSubmit={async (notes: string, audioReplayCount: number) => {
                  if (notes.trim()) {
                    await saveTaskResponse(currentTaskIndex, JSON.stringify({ notes, audioReplayCount }))
                  }
                }}
                onNotesChange={(notes) => {
                  if (notes.trim()) {
                    setTaskContents((prev) => ({
                      ...prev,
                      [currentTaskIndex]: JSON.stringify({ notes, audioReplayCount: 0 }),
                    }))
                  }
                }}
                onTimerPause={(remaining) =>
                  setTaskPausedRemaining((prev) => ({ ...prev, [currentTaskIndex]: remaining }))
                }
                onComplete={() => handleTaskSubmit(currentTaskIndex)}
                disabled={false}
              />
            )
          })()}

          {currentTask?.task_type === 'speaking' && (
            <Task4Speaking
              attemptId={attemptId!}
              taskId={currentTask.id}
              questions={[{
                id: 'q-1',
                order: 1,
                question: currentTask.description || 'Please answer the interview questions.',
                timeLimitSeconds: currentTask.time_limit_seconds || 180,
              }] as SpeakingQuestion[]}
              initialContent={taskContents[currentTaskIndex] || ''}
              onSubmit={async (audioKeys: string[]) => {
                await saveTaskResponse(currentTaskIndex, JSON.stringify({ audioKeys }))
              }}
              saveResponse={async (content: string) => {
                await saveTaskResponse(currentTaskIndex, content)
              }}
              onComplete={() => handleTaskSubmit(currentTaskIndex)}
              disabled={false}
            />
          )}

          {!currentTask && (
            <div className="flex items-center justify-center h-full text-gray-400">
              <p>No task selected</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
