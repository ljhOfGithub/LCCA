import { useState, useEffect, useRef, useCallback } from 'react'
import AudioPlayer from '../../components/AudioPlayer'
import NotesEditor from '../../components/NotesEditor'

interface Task3ListeningProps {
  attemptId: string
  taskId: string
  audioUrl: string
  audioDuration: number // in seconds
  timeLimit: number // in seconds
  initialNotes?: string
  onSubmit: (notes: string, audioReplayCount: number) => Promise<void>
  onComplete: () => void
  disabled?: boolean
}

export default function Task3Listening({
  attemptId,
  taskId,
  audioUrl,
  audioDuration,
  timeLimit,
  initialNotes = '',
  onSubmit,
  onComplete,
  disabled = false,
}: Task3ListeningProps) {
  const [notes, setNotes] = useState(initialNotes)
  const [audioReplayCount, setAudioReplayCount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [hasUsedReplay, setHasUsedReplay] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(timeLimit)

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countDownRef = useRef<NodeJS.Timeout | null>(null)

  // Countdown timer
  useEffect(() => {
    if (disabled) return

    countDownRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countDownRef.current) {
        clearInterval(countDownRef.current)
      }
    }
  }, [disabled])

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

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleAutoSave = useCallback(async () => {
    if (!notes.trim()) return

    try {
      // Save to backend
      await fetch(`/api/v1/attempts/${attemptId}/tasks/${taskId}/response`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      })
      setLastSaved(new Date())
    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }, [attemptId, taskId, notes])

  const handleReplayUsed = () => {
    setAudioReplayCount((prev) => prev + 1)
    setHasUsedReplay(true)
  }

  const handleSubmit = async () => {
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      await onSubmit(notes, audioReplayCount)
      onComplete()
    } catch (error) {
      console.error('Submit failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isWarning = timeRemaining <= 60 // Warning when less than 1 minute

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Task 3: Listening & Note-taking</h2>
          <p className="text-sm text-gray-500 mt-1">
            Listen to the audio and take notes. You have one replay opportunity.
          </p>
        </div>

        {/* Timer */}
        <div
          className={`px-4 py-2 rounded-lg flex items-center gap-2
            ${isWarning ? 'bg-warning-100 border-2 border-warning-500' : 'bg-gray-100'}
          `}
        >
          <svg
            className={`w-5 h-5 ${isWarning ? 'text-warning-600' : 'text-gray-600'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span
            className={`font-mono text-lg font-bold
              ${isWarning ? 'text-warning-600' : 'text-gray-800'}
            `}
          >
            {formatTime(timeRemaining)}
          </span>
        </div>
      </div>

      {/* Audio Player Section */}
      <div className="flex-0">
        <AudioPlayer
          audioUrl={audioUrl}
          duration={audioDuration}
          onReplayUsed={handleReplayUsed}
          replayAvailable={!hasUsedReplay}
          disabled={disabled || isSubmitting}
        />
      </div>

      {/* Notes Section */}
      <div className="flex-1 min-h-0">
        <NotesEditor
          value={notes}
          onChange={setNotes}
          disabled={disabled || isSubmitting}
          autoSave={true}
          onAutoSave={handleAutoSave}
          lastSavedAt={lastSaved}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          onClick={handleSubmit}
          disabled={disabled || isSubmitting || !notes.trim()}
          className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2
            ${notes.trim() && !disabled && !isSubmitting
              ? 'bg-primary-600 text-white hover:bg-primary-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }
          `}
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
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Submit Task 3
            </>
          )}
        </button>
      </div>
    </div>
  )
}