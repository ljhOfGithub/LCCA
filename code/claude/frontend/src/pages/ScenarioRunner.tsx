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
import type { Scenario, Task, TaskDetailResponse } from '../types'

interface SpeakingQuestion {
  id: string
  order: number
  question: string
  timeLimitSeconds: number
}

export default function ScenarioRunner() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()

  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0)
  const [currentTaskDetail, setCurrentTaskDetail] = useState<TaskDetailResponse | null>(null)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [taskResponseIds, setTaskResponseIds] = useState<Record<number, string>>({})
  const [taskStatuses, setTaskStatuses] = useState<Record<number, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentTask = tasks[currentTaskIndex]
  const totalSeconds = (scenario?.duration_minutes || 30) * 60

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
    warningThreshold: 300, // 5 minutes
  })

  // Load scenario and tasks
  useEffect(() => {
    if (scenarioId) {
      loadScenarioData()
    }
  }, [scenarioId])

  // Load task details when current task changes
  useEffect(() => {
    if (currentTask && scenarioId) {
      loadTaskDetails(currentTask.index)
    }
  }, [currentTaskIndex])

  const loadScenarioData = async () => {
    setIsLoading(true)
    try {
      // 获取场景详情（含任务列表）
      const scenarioResponse = await scenarioApi.get(scenarioId!)
      setScenario(scenarioResponse.data)
      setTasks(scenarioResponse.data.tasks || [])

      // 创建考试尝试
      const attemptResponse = await attemptApi.create(scenarioId!)
      setAttemptId(attemptResponse.data.id)

      // 初始化所有任务状态为not_started
      const initialStatuses: Record<number, string> = {}
      const initialResponseIds: Record<number, string> = {}
      scenarioResponse.data.tasks?.forEach((_task: Task, index: number) => {
        initialStatuses[index] = 'not_started'
        initialResponseIds[index] = ''
      })
      setTaskStatuses(initialStatuses)
      setTaskResponseIds(initialResponseIds)

      // 开始尝试
      await attemptApi.start(attemptResponse.data.id)
      start()
    } catch (error) {
      console.error('Failed to load scenario:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadTaskDetails = async (taskIndex: number) => {
    try {
      const response = await scenarioApi.getTask(scenarioId!, taskIndex)
      setCurrentTaskDetail(response.data)
    } catch (error) {
      console.error('Failed to load task details:', error)
    }
  }

  const saveTaskResponse = async (taskIndex: number, content: string) => {
    const responseId = taskResponseIds[taskIndex]
    if (!responseId || !attemptId) return

    try {
      await fetch(`/api/v1/attempts/${attemptId}/responses/${responseId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
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
      // 提交任务响应
      await fetch(`/api/v1/attempts/${attemptId}/responses/${responseId}/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      })

      // 更新状态
      setTaskStatuses((prev) => ({ ...prev, [taskIndex]: 'completed' }))

      // 获取下一个任务
      const nextIndex = taskIndex + 1
      if (nextIndex < tasks.length) {
        // 初始化下一个任务
        await initializeTask(nextIndex)
        setCurrentTaskIndex(nextIndex)
      }
    } catch (error) {
      console.error('Failed to submit task:', error)
    }
  }

  const initializeTask = async (taskIndex: number) => {
    if (!attemptId || !currentTask) return

    try {
      const response = await fetch(`/api/v1/attempts/${attemptId}/responses`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
        },
      })
      const data = await response.json()

      // 找到对应任务的response id
      const taskResponse = data.items?.find(
        (r: any) => r.task_id === tasks[taskIndex].id
      )

      if (taskResponse) {
        setTaskResponseIds((prev) => ({
          ...prev,
          [taskIndex]: taskResponse.id,
        }))
        setTaskStatuses((prev) => ({
          ...prev,
          [taskIndex]: taskResponse.status === 'submitted' ? 'completed' : 'in_progress',
        }))
      }
    } catch (error) {
      console.error('Failed to initialize task:', error)
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
      alert('Time is up! Your answers have been submitted.')
      navigate('/')
    } catch (error) {
      console.error('Failed to submit exam:', error)
      alert('Failed to submit. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleTaskClick = (taskId: string) => {
    const taskIndex = tasks.findIndex((t) => t.id === taskId)
    if (taskIndex !== -1 && taskStatuses[taskIndex] !== 'not_started') {
      setCurrentTaskIndex(taskIndex)
    }
  }

  const progressTasks = tasks.map((task, index) => ({
    id: task.id,
    title: task.title,
    type: task.type,
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
            <h1 className="text-lg font-semibold text-gray-900">{scenario?.title}</h1>
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
        {/* Sidebar - Progress */}
        <aside className="w-72 flex-shrink-0">
          <ProgressBar
            tasks={progressTasks}
            currentTaskId={currentTask?.id}
            onTaskClick={handleTaskClick}
          />

          {/* Submit Button */}
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
          {currentTask?.type === 'reading' && currentTaskDetail?.prompt && (
            <Task1Reading
              advertisement={{
                title: currentTaskDetail.title,
                body: currentTaskDetail.prompt.content.find((c) => c.type === 'text')?.content || '',
              }}
              attemptId={attemptId!}
              taskId={currentTask.id}
              taskIndex={currentTaskIndex}
              onSubmit={() => handleTaskSubmit(currentTaskIndex)}
              saveResponse={saveTaskResponse}
            />
          )}

          {currentTask?.type === 'writing' && currentTaskDetail?.prompt && (
            <Task2Writing
              referenceMaterials={{
                resume: 'Resume content here',
                job_description: currentTaskDetail.prompt.content.find((c) => c.type === 'text')?.content || '',
              }}
              wordLimit={{
                min: 150,
                max: currentTaskDetail.prompt.max_words || 300,
              }}
              attemptId={attemptId!}
              taskId={currentTask.id}
              taskIndex={currentTaskIndex}
              onSubmit={() => handleTaskSubmit(currentTaskIndex)}
              saveResponse={saveTaskResponse}
            />
          )}

          {currentTask?.type === 'listening' && currentTaskDetail?.prompt && (
            <Task3Listening
              attemptId={attemptId!}
              taskId={currentTask.id}
              audioUrl={currentTaskDetail.prompt.content.find((c) => c.type === 'audio')?.content || ''}
              audioDuration={currentTaskDetail.prompt.max_duration_seconds || 180}
              timeLimit={currentTask.time_limit_seconds || 300}
              initialNotes=""
              onSubmit={async (notes: string, _audioReplayCount: number) => {
                // Save the listening notes
                await saveTaskResponse(currentTaskIndex, JSON.stringify({ notes, audioReplayCount: _audioReplayCount }))
              }}
              onComplete={() => handleTaskSubmit(currentTaskIndex)}
              disabled={false}
            />
          )}

          {currentTask?.type === 'speaking' && currentTaskDetail?.prompt && (
            <Task4Speaking
              attemptId={attemptId!}
              taskId={currentTask.id}
              questions={currentTaskDetail.prompt.content
                .filter((c) => c.type === 'text')
                .map((c, idx) => ({
                  id: `q-${idx}`,
                  order: idx + 1,
                  question: c.content,
                  timeLimitSeconds: currentTaskDetail.prompt?.max_duration_seconds || 180,
                })) as SpeakingQuestion[]}
              onSubmit={async (audioKeys: string[]) => {
                // Save the speaking responses
                await saveTaskResponse(currentTaskIndex, JSON.stringify({ audioKeys }))
              }}
              onComplete={() => handleTaskSubmit(currentTaskIndex)}
              disabled={false}
            />
          )}
        </div>
      </main>
    </div>
  )
}