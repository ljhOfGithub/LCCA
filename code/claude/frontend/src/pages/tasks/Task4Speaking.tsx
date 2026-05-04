import { useState, useEffect, useCallback } from 'react'
import RecordingControls, { useAudioRecording } from '../../components/RecordingControls'

interface SpeakingQuestion {
  id: string
  order: number
  question: string
  timeLimitSeconds: number
}

interface Task4SpeakingProps {
  attemptId: string
  taskId: string
  questions: SpeakingQuestion[]
  initialContent?: string
  onSubmit: (audioKeys: string[]) => Promise<void>
  onComplete: () => void
  saveResponse?: (content: string) => Promise<void>
  disabled?: boolean
}

export default function Task4Speaking({
  attemptId,
  taskId,
  questions,
  initialContent,
  onSubmit,
  onComplete,
  saveResponse,
  disabled = false,
}: Task4SpeakingProps) {
  // Restore recordings from persisted content (audio keys only, no blob URLs after remount)
  const restoredRecordings = (() => {
    if (!initialContent) return {}
    try {
      const parsed = JSON.parse(initialContent)
      if (parsed.recordingMap && typeof parsed.recordingMap === 'object') return parsed.recordingMap
      // Fallback: audioKeys array format (from final submit)
      if (Array.isArray(parsed.audioKeys)) {
        const map: Record<string, string> = {}
        questions.forEach((q, idx) => { if (parsed.audioKeys[idx]) map[q.id] = parsed.audioKeys[idx] })
        return map
      }
    } catch {}
    return {}
  })()

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [recordings, setRecordings] = useState<{ [key: string]: string }>(restoredRecordings) // questionId -> audioKey
  const [recordingBlobUrls, setRecordingBlobUrls] = useState<{ [key: string]: string }>({}) // questionId -> blob URL for playback
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const {
    isRecording,
    duration,
    audioUrl,
    isUploading,
    error,
    startRecording,
    stopRecording,
    uploadRecording,
    resetRecording,
  } = useAudioRecording(180) // 3 minutes max

  const currentQuestion = questions[currentQuestionIndex]
  const isQuestionAnswered = currentQuestion && recordings[currentQuestion.id] !== undefined
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const isAllAnswered = questions.every((q) => recordings[q.id] !== undefined)

  const handleStartRecording = useCallback(async () => {
    resetRecording()
    await startRecording()
  }, [startRecording, resetRecording])

  const handleStopRecording = useCallback(async () => {
    stopRecording()
  }, [stopRecording])

  const handleConfirmRecording = useCallback(async () => {
    if (!currentQuestion || !audioUrl) return

    // Snapshot the blob URL before upload (uploadRecording might clear it)
    const blobUrlSnapshot = audioUrl

    setIsTransitioning(true)
    try {
      const storageKey = await uploadRecording(attemptId, taskId)

      const newRecordings = { ...recordings, [currentQuestion.id]: storageKey }
      setRecordings(newRecordings)
      setRecordingBlobUrls((prev) => ({ ...prev, [currentQuestion.id]: blobUrlSnapshot }))

      // Persist after each confirmed recording so state survives task navigation
      if (saveResponse) {
        await saveResponse(JSON.stringify({ recordingMap: newRecordings })).catch(console.error)
      }
    } catch (err) {
      console.error('Failed to save recording:', err)
    } finally {
      setIsTransitioning(false)
    }
  }, [currentQuestion, audioUrl, uploadRecording, attemptId, taskId, recordings, saveResponse])

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1)
      resetRecording()
    }
  }

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1)
      resetRecording()
    }
  }

  const handleSubmitAll = async () => {
    if (isAllAnswered && !isSubmitting) {
      setIsSubmitting(true)
      try {
        const audioKeys = questions.map((q) => recordings[q.id])
        await onSubmit(audioKeys)
        onComplete()
      } catch (err) {
        console.error('Submit failed:', err)
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  // Reset recording when question changes
  useEffect(() => {
    resetRecording()
  }, [currentQuestionIndex])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Task 4: Speaking</h2>
          <p className="text-sm text-gray-500 mt-1">
            Answer the questions in sequence. You have 3 minutes for each question.
          </p>
        </div>

        {/* Question Progress */}
        <div className="flex items-center gap-2">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${recordings[q.id]
                  ? 'bg-success-500 text-white'
                  : idx === currentQuestionIndex
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-200 text-gray-500'
                }
              `}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Question Content */}
      <div className="flex-1 flex flex-col gap-6 py-6">
        {/* Current Question */}
        <div className="bg-primary-50 rounded-lg p-6 border border-primary-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-primary-700">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
            {currentQuestion && (
              <span className="text-sm text-primary-600">
                Time limit: {formatTime(currentQuestion.timeLimitSeconds)}
              </span>
            )}
          </div>
          <p className="text-lg text-gray-800 font-medium leading-relaxed">
            {currentQuestion?.question}
          </p>
        </div>

        {/* Recording Section */}
        <div className="flex-1">
          {isQuestionAnswered ? (
            // Recording completed
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="flex items-center gap-2 text-success-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Recording completed</span>
                </div>
              </div>

              <audio
                src={recordingBlobUrls[currentQuestion?.id] || audioUrl || undefined}
                controls
                className="w-full"
              />

              <p className="text-sm text-gray-500 text-center mt-4">
                You cannot re-record once submitted. Please proceed to the next question.
              </p>

              {/* Playback info */}
              <div className="mt-4 text-center text-xs text-gray-400">
                Recording duration: {formatTime(duration)}
              </div>
            </div>
          ) : (
            // Recording controls
            <RecordingControls
              isRecording={isRecording}
              duration={duration}
              maxDuration={currentQuestion?.timeLimitSeconds || 180}
              disabled={disabled || isSubmitting}
              onStartRecording={handleStartRecording}
              onStopRecording={handleStopRecording}
            />
          )}

          {/* Error display */}
          {error && (
            <div className="mt-4 p-4 bg-danger-50 border border-danger-200 rounded-lg text-danger-700">
              {error}
            </div>
          )}

          {/* Confirm recording button */}
          {audioUrl && !isQuestionAnswered && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleConfirmRecording}
                disabled={isTransitioning || isUploading}
                className={`px-6 py-2 rounded-lg font-medium transition-colors
                  ${isTransitioning || isUploading
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-success-600 text-white hover:bg-success-700'
                  }
                `}
              >
                {isTransitioning || isUploading ? 'Saving...' : 'Confirm Recording'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        {/* Previous Button */}
        <button
          onClick={handlePreviousQuestion}
          disabled={currentQuestionIndex === 0}
          className={`px-4 py-2 rounded-lg transition-colors
            ${currentQuestionIndex === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }
          `}
        >
          <span className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </span>
        </button>

        {/* Next/Submit Button */}
        {isLastQuestion ? (
          <button
            onClick={handleSubmitAll}
            disabled={!isAllAnswered || isSubmitting}
            className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2
              ${isAllAnswered && !isSubmitting
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
                Submit All
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleNextQuestion}
            disabled={!isQuestionAnswered}
            className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2
              ${isQuestionAnswered
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            Next
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}