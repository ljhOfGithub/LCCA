import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, RotateCcw, Volume2, Loader2 } from 'lucide-react'
import { useListening } from '../../hooks/useListening'
import { useExamStore } from '../../stores/examStore'

interface ListeningComprehensionProps {
  attemptId: string
  taskId: string
  audioUrl: string
  audioDuration?: number
  timeLimit: number // in seconds
  showTranscript?: boolean
  transcript?: string
  onSubmit: (notes: string, audioReplayCount: number) => Promise<void>
  onComplete: () => void
  disabled?: boolean
}

export default function ListeningComprehension({
  attemptId,
  taskId,
  audioUrl,
  audioDuration = 0,
  timeLimit,
  showTranscript = false,
  transcript = '',
  onSubmit,
  onComplete,
  disabled = false,
}: ListeningComprehensionProps) {
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(timeLimit)

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const countDownRef = useRef<NodeJS.Timeout | null>(null)
  const saveToStore = useExamStore((s) => s.saveListeningNotes)

  const {
    isPlaying,
    currentTime,
    duration,
    replayCount,
    hasUsedReplay,
    replay,
    seek,
    togglePlay,
  } = useListening({ audioUrl })

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
        saveToStore(notes)
      }
    }, 30000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [notes, saveToStore])

  const handleAutoSave = useCallback(async () => {
    if (!notes.trim()) return

    try {
      await fetch(`/api/v1/attempts/${attemptId}/tasks/${taskId}/response`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes_content: notes }),
      })
      setLastSaved(new Date())
    } catch (error) {
      console.error('Auto-save failed:', error)
    }
  }, [attemptId, taskId, notes])

  const handleSubmit = async () => {
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      await onSubmit(notes, replayCount)
      onComplete()
    } catch (error) {
      console.error('Submit failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const isWarning = timeRemaining <= 60

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Volume2 className="w-5 h-5" />
            Task 3: Listening Comprehension
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Listen carefully and take notes. You have one replay opportunity.
          </p>
        </div>

        {/* Timer */}
        <div
          className={`px-4 py-2 rounded-lg flex items-center gap-2
            ${isWarning ? 'bg-amber-100 border-2 border-amber-500' : 'bg-gray-100'}
          `}
        >
          <span
            className={`font-mono text-lg font-bold
              ${isWarning ? 'text-amber-600' : 'text-gray-800'}
            `}
          >
            {formatTime(timeRemaining)}
          </span>
        </div>
      </div>

      {/* Audio Player Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            disabled={disabled || !audioUrl}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all
              ${isPlaying
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          {/* Audio Info */}
          <div className="flex-1 mx-4">
            <div className="text-sm font-medium text-gray-700">
              {isPlaying ? 'Playing...' : 'Ready to play'}
            </div>
            <div className="text-xs text-gray-500">
              {formatTime(currentTime)} / {formatTime(audioDuration || duration)}
            </div>
          </div>

          {/* Replay Button */}
          <button
            onClick={replay}
            disabled={hasUsedReplay || disabled}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all
              ${hasUsedReplay
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
              }
              ${disabled ? 'opacity-50' : ''}
            `}
          >
            <RotateCcw className="w-5 h-5" />
            {hasUsedReplay ? 'Replay used' : `Replay (1 left)`}
          </button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
              disabled:opacity-50 disabled:cursor-not-allowed
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-primary-600"
            style={{
              background: `linear-gradient(to right, #2563eb ${progress}%, #e5e7eb ${progress}%)`,
            }}
          />
        </div>
      </div>

      {/* Transcript Section (Optional) */}
      {showTranscript && transcript && (
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <h3 className="text-sm font-medium text-blue-800 mb-2">Transcript</h3>
          <p className="text-sm text-gray-700 leading-relaxed">{transcript}</p>
        </div>
      )}

      {/* Notes Section */}
      <div className="flex-1 min-h-0">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={disabled || isSubmitting}
          placeholder="Take notes while listening..."
          className="w-full h-48 p-4 border border-gray-300 rounded-lg resize-none
            focus:ring-2 focus:ring-primary-500 focus:border-primary-500
            disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {lastSaved && (
          <p className="text-xs text-gray-500 mt-1">
            Last saved: {lastSaved.toLocaleTimeString()}
          </p>
        )}
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
              <Loader2 className="w-5 h-5 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Task 3'
          )}
        </button>
      </div>
    </div>
  )
}