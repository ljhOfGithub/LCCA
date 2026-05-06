import { useState, useEffect, useRef } from 'react'
import RichTextEditor from '../../components/RichTextEditor'

type ReferenceTab = 'resume' | 'job_description' | 'notes'

interface Task2WritingProps {
  referenceMaterials: {
    resume?: string
    job_description?: string
    notes?: string
  }
  wordLimit?: {
    min: number
    max: number
  }
  taskTitle?: string
  taskDescription?: string | null
  attemptId: string
  taskId: string
  taskIndex: number
  initialContent?: string
  timeLimit?: number
  initialTimeRemaining?: number
  onSubmit?: () => void
  saveResponse: (taskIndex: number, content: string) => void
  onContentChange?: (content: string) => void
  onTimerPause?: (remaining: number) => void
  isSubmitted?: boolean
}

export default function Task2Writing({
  referenceMaterials,
  wordLimit = { min: 150, max: 300 },
  taskTitle,
  taskDescription,
  taskIndex,
  initialContent = '',
  timeLimit,
  initialTimeRemaining,
  onSubmit,
  saveResponse,
  onContentChange,
  onTimerPause,
  isSubmitted = false,
}: Task2WritingProps) {
  const [response, setResponse] = useState(initialContent)

  useEffect(() => {
    setResponse(initialContent)
  }, [initialContent])
  const [activeTab, setActiveTab] = useState<ReferenceTab>(() => {
    if (referenceMaterials.resume) return 'resume'
    if (referenceMaterials.job_description) return 'job_description'
    return 'notes'
  })
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    initialTimeRemaining != null ? Math.floor(initialTimeRemaining)
    : timeLimit != null ? timeLimit
    : null
  )
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)

  const onSubmitRef = useRef<(() => void) | undefined>(onSubmit)
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])

  const timeRemainingRef = useRef(timeRemaining ?? 0)
  const onTimerPauseRef = useRef(onTimerPause)
  useEffect(() => { onTimerPauseRef.current = onTimerPause }, [onTimerPause])
  useEffect(() => () => { if (timeRemainingRef.current > 0) onTimerPauseRef.current?.(timeRemainingRef.current) }, [])

  useEffect(() => {
    if (timeRemaining === null) return
    countdownRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev === null || prev <= 1 ? 0 : prev - 1
        timeRemainingRef.current = next
        if (next === 0) onSubmitRef.current?.()
        return next
      })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      if (response.trim() && response !== '<p></p>') {
        handleAutoSave()
      }
    }, 30000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [response])

  // Debounced save on content change
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (response.trim() && response !== '<p></p>') {
        handleAutoSave()
      }
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [response])

  // Stop countdown when submitted
  useEffect(() => {
    if (isSubmitted && countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [isSubmitted])

  const handleAutoSave = async () => {
    if (isSubmitted || !response.trim() || response === '<p></p>') return

    setIsSaving(true)
    try {
      await saveResponse(taskIndex, response)
      setLastSaved(new Date())
    } catch (error) {
      console.error('Auto-save failed:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleManualSave = async () => {
    await handleAutoSave()
  }

  const allTabs: { key: ReferenceTab; label: string; content?: string }[] = [
    { key: 'resume', label: 'Resume', content: referenceMaterials.resume },
    { key: 'job_description', label: 'Job Description', content: referenceMaterials.job_description },
    { key: 'notes', label: 'Notes', content: referenceMaterials.notes },
  ]
  const tabs = allTabs.filter((t) => Boolean(t.content))

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">{taskTitle || 'Task 2: Cover Letter Writing'}</h2>
          {taskDescription && (
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">{taskDescription}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {timeRemaining !== null && (
            <div className={`px-3 py-1.5 rounded-lg flex items-center gap-1 text-sm font-mono font-bold
              ${timeRemaining <= 60 ? 'bg-red-100 text-red-600 border border-red-300' : 'bg-gray-100 text-gray-700'}`}>
              ⏱ {formatTime(timeRemaining)}
            </div>
          )}
        <div className="flex items-center gap-2 text-sm">
          {isSaving ? (
            <span className="text-blue-600 flex items-center gap-1">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </span>
          ) : lastSaved ? (
            <span className="text-gray-500">
              Last saved: {lastSaved.toLocaleTimeString()}
            </span>
          ) : null}
          {!isSubmitted && (
            <button
              onClick={handleManualSave}
              className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Save Now
            </button>
          )}
        </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-4 mt-4 min-h-0">
        {/* Left: Reference Materials */}
        <div className="flex-1 flex flex-col min-w-0">
          <h3 className="font-semibold text-gray-700 mb-2">Reference Materials</h3>
          <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden">
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 text-sm font-medium transition-colors
                    ${activeTab === tab.key
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                      : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="p-4 overflow-y-auto h-[calc(100%-40px)]">
              {activeTab === 'resume' && referenceMaterials.resume && (
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                  {referenceMaterials.resume}
                </pre>
              )}
              {activeTab === 'job_description' && referenceMaterials.job_description && (
                <div className="prose prose-sm max-w-none text-gray-700">
                  {referenceMaterials.job_description}
                </div>
              )}
              {activeTab === 'notes' && referenceMaterials.notes && (
                <div className="prose prose-sm max-w-none text-gray-700">
                  {referenceMaterials.notes}
                </div>
              )}
              {!tabs.find((t) => t.key === activeTab)?.content && (
                <p className="text-gray-400 italic">No content available</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Rich Text Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-700">Your Cover Letter</h3>
            <span className="text-xs text-gray-500">
              Word limit: {wordLimit.min}-{wordLimit.max}
            </span>
          </div>
          <div className="flex-1">
            <RichTextEditor
              content={response}
              onChange={(val) => {
                if (isSubmitted) return
                setResponse(val)
                onContentChange?.(val)
              }}
              placeholder="Write your cover letter here..."
              wordLimit={wordLimit}
              disabled={isSubmitted}
            />
          </div>
        </div>
      </div>

      {/* Submit / Submitted */}
      <div className="flex justify-end pt-4 border-t border-gray-200 mt-4">
        {isSubmitted ? (
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Task submitted
          </span>
        ) : onSubmit && (
          <button
            onClick={onSubmit}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
              font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Submit Task 2
          </button>
        )}
      </div>
    </div>
  )
}