import { useState, useEffect, useRef } from 'react'

interface Task1ReadingProps {
  advertisement: {
    title: string
    body: string
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

export default function Task1Reading({
  advertisement,
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
}: Task1ReadingProps) {
  const [notes, setNotes] = useState(initialContent)

  useEffect(() => {
    setNotes(initialContent)
  }, [initialContent])
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

  const handleSubmitRef = useRef<(() => void) | undefined>(onSubmit)
  useEffect(() => { handleSubmitRef.current = onSubmit }, [onSubmit])

  const timeRemainingRef = useRef(timeRemaining ?? 0)
  const onTimerPauseRef = useRef(onTimerPause)
  useEffect(() => { onTimerPauseRef.current = onTimerPause }, [onTimerPause])
  useEffect(() => () => { if (timeRemainingRef.current > 0) onTimerPauseRef.current?.(timeRemainingRef.current) }, [])

  // Countdown timer
  useEffect(() => {
    if (timeRemaining === null) return
    countdownRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        const next = prev === null || prev <= 1 ? 0 : prev - 1
        timeRemainingRef.current = next
        if (next === 0) handleSubmitRef.current?.()
        return next
      })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Auto-save every 30 seconds
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      if (notes.trim()) {
        handleAutoSave()
      }
    }, 30000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [notes])

  // Debounced save on content change
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      if (notes.trim()) {
        handleAutoSave()
      }
    }, 2000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [notes])

  // Stop countdown when submitted
  useEffect(() => {
    if (isSubmitted && countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [isSubmitted])

  const handleAutoSave = async () => {
    if (isSubmitted || !notes.trim()) return

    setIsSaving(true)
    try {
      await saveResponse(taskIndex, notes)
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

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">{taskTitle || 'Task 1: Reading & Note-taking'}</h2>
          {taskDescription && (
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">{taskDescription}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {timeRemaining !== null && (
            <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm font-mono font-bold
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
        {/* Left: Advertisement (Read-only) */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-700">Advertisement</h3>
          </div>
          <div className="flex-1 bg-white border border-gray-200 rounded-lg p-6 overflow-y-auto">
            <h4 className="text-lg font-bold text-blue-700 mb-4">{advertisement.title}</h4>
            <div className="prose prose-gray max-w-none whitespace-pre-wrap text-gray-700 leading-relaxed">
              {advertisement.body}
            </div>
          </div>
        </div>

        {/* Right: Notes Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-700">Your Notes</h3>
            <span className="text-xs text-gray-400">{notes.length} characters</span>
          </div>
          <div className="flex-1">
            <textarea
              value={notes}
              readOnly={isSubmitted}
              onChange={(e) => {
                if (isSubmitted) return
                setNotes(e.target.value)
                onContentChange?.(e.target.value)
              }}
              placeholder="Take notes here... You can type freely."
              className={`w-full h-full border rounded-lg p-4 resize-none text-gray-700 placeholder-gray-400
                ${isSubmitted
                  ? 'bg-gray-50 border-gray-200 cursor-default'
                  : 'bg-white border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                }`}
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
            Submit Task 1
          </button>
        )}
      </div>
    </div>
  )
}