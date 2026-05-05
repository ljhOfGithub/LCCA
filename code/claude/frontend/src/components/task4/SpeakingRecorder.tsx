import { useState, useEffect, useCallback } from 'react'
import { Mic, Square, Check, X, Loader2, AlertCircle } from 'lucide-react'
import { useRecorder } from '../../hooks/useRecorder'
import { useAudioUpload } from '../../hooks/useAudioUpload'
import { useExamStore } from '../../stores/examStore'

interface SpeakingQuestion {
  id: string
  order: number
  question: string
  timeLimitSeconds: number
}

interface SpeakingRecorderProps {
  attemptId: string
  taskId: string
  questions: SpeakingQuestion[]
  onSubmit: (audioKeys: string[]) => Promise<void>
  onComplete: () => void
  disabled?: boolean
}

export default function SpeakingRecorder({
  attemptId,
  taskId,
  questions,
  onSubmit,
  onComplete,
  disabled = false,
}: SpeakingRecorderProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [recordings, setRecordings] = useState<{ [key: string]: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const addRecording = useExamStore((s) => s.addRecording)

  const {
    isRecording,
    duration,
    audioUrl,
    error,
    analyserRef,
    startRecording,
    stopRecording,
    resetRecording,
  } = useRecorder({
    maxDurationSeconds: questions[currentQuestionIndex]?.timeLimitSeconds || 180,
  })

  const { isUploading, uploadAudio, error: uploadError } = useAudioUpload({
    attemptId,
    taskId,
  })

  const currentQuestion = questions[currentQuestionIndex]
  const isQuestionAnswered = currentQuestion && recordings[currentQuestion.id] !== undefined
  const isLastQuestion = currentQuestionIndex === questions.length - 1
  const isAllAnswered = questions.every((q) => recordings[q.id] !== undefined)

  // Reset recording when question changes
  useEffect(() => {
    resetRecording()
  }, [currentQuestionIndex, resetRecording])

  const handleStartRecording = useCallback(async () => {
    resetRecording()
    await startRecording()
  }, [startRecording, resetRecording])

  const handleStopRecording = useCallback(() => {
    stopRecording()
  }, [stopRecording])

  const handleConfirmRecording = useCallback(async () => {
    if (!currentQuestion || !audioUrl) return

    setIsTransitioning(true)
    try {
      // Upload the recording
      const blob = await fetch(audioUrl).then((r) => r.blob())
      const storageKey = await uploadAudio(blob)

      // Save to local state
      setRecordings((prev) => ({
        ...prev,
        [currentQuestion.id]: storageKey,
      }))

      // Update exam store
      addRecording(currentQuestion.id, storageKey)
    } catch (err) {
      console.error('Failed to save recording:', err)
    } finally {
      setIsTransitioning(false)
    }
  }, [currentQuestion, audioUrl, uploadAudio, addRecording])

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

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const maxDuration = currentQuestion?.timeLimitSeconds || 180
  const isNearLimit = duration >= maxDuration - 10

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            <Mic className="w-5 h-5" />
            Task 4: Speaking
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Answer each question with a recorded response. Click to re-record before confirming.
          </p>
        </div>

        {/* Question Progress */}
        <div className="flex items-center gap-2">
          {questions.map((q, idx) => (
            <div
              key={q.id}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${recordings[q.id]
                  ? 'bg-green-500 text-white'
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
            // Recording completed - show playback
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="flex items-center gap-2 text-green-600">
                  <Check className="w-6 h-6" />
                  <span className="font-medium">Recording completed</span>
                </div>
              </div>

              <audio
                src={audioUrl || undefined}
                controls
                className="w-full"
              />

              <p className="text-sm text-gray-500 text-center mt-4">
                You cannot re-record once confirmed. Please proceed to the next question.
              </p>

              <div className="mt-4 text-center text-xs text-gray-400">
                Recording duration: {formatTime(duration)}
              </div>
            </div>
          ) : (
            // Recording controls
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              {/* Time Display */}
              <div className="flex items-center justify-center mb-4">
                <div
                  className={`px-4 py-2 rounded-lg flex items-center gap-2
                    ${isRecording
                      ? 'bg-red-50 border-2 border-red-500'
                      : 'bg-gray-100'
                    }
                  `}
                >
                  <span
                    className={`font-mono text-xl font-bold
                      ${isRecording ? 'text-red-600' : 'text-gray-800'}
                    `}
                  >
                    {formatTime(duration)}
                  </span>
                  <span className="text-sm text-gray-500">/ {formatTime(maxDuration)}</span>
                </div>
              </div>

              {/* Waveform Canvas */}
              <div className="mb-4 bg-gray-50 rounded-lg overflow-hidden">
                <canvas
                  ref={(canvas) => {
                    if (canvas && analyserRef.current) {
                      const ctx = canvas.getContext('2d')
                      if (!ctx) return

                      const draw = () => {
                        const bufferLength = analyserRef.current!.frequencyBinCount
                        const dataArray = new Uint8Array(bufferLength)
                        analyserRef.current!.getByteTimeDomainData(dataArray)

                        ctx.fillStyle = '#f3f4f6'
                        ctx.fillRect(0, 0, canvas.width, canvas.height)

                        ctx.lineWidth = 2
                        ctx.strokeStyle = '#2563eb'
                        ctx.beginPath()

                        const sliceWidth = canvas.width / bufferLength
                        let x = 0

                        for (let i = 0; i < bufferLength; i++) {
                          const v = dataArray[i] / 128.0
                          const y = (v * canvas.height) / 2

                          if (i === 0) {
                            ctx.moveTo(x, y)
                          } else {
                            ctx.lineTo(x, y)
                          }
                          x += sliceWidth
                        }

                        ctx.lineTo(canvas.width, canvas.height / 2)
                        ctx.stroke()

                        if (isRecording) {
                          requestAnimationFrame(draw)
                        }
                      }
                      draw()
                    }
                  }}
                  width={400}
                  height={80}
                  className="w-full h-20"
                />
              </div>

              {/* Recording Button */}
              <div className="flex justify-center">
                {!isRecording ? (
                  <button
                    onClick={handleStartRecording}
                    disabled={disabled || isUploading}
                    className={`px-8 py-3 rounded-full font-medium transition-all flex items-center gap-2
                      ${disabled || isUploading
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-red-500 text-white hover:bg-red-600 hover:scale-105'
                      }
                    `}
                  >
                    <Mic className="w-6 h-6" />
                    Start Recording
                  </button>
                ) : (
                  <button
                    onClick={handleStopRecording}
                    className="px-8 py-3 rounded-full font-medium transition-all flex items-center gap-2
                      bg-green-500 text-white hover:bg-green-600 hover:scale-105 animate-pulse"
                  >
                    <Square className="w-6 h-6" />
                    Stop Recording
                  </button>
                )}
              </div>

              {/* Recording Status */}
              {isRecording && (
                <div className="mt-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-red-600">
                    <span className="w-3 h-3 bg-red-600 rounded-full animate-ping" />
                    <span className="font-medium">Recording in progress...</span>
                  </div>
                  {isNearLimit && (
                    <p className="text-sm text-amber-600 mt-2">
                      Less than 10 seconds remaining. Please finish your response.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error display */}
          {(error || uploadError) && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {error || uploadError}
            </div>
          )}

          {/* Playback + confirm/re-record controls */}
          {audioUrl && !isQuestionAnswered && (
            <div className="mt-4 space-y-3">
              {/* Playback */}
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-2 font-medium">录音回放 — 确认前可以先听一遍</p>
                <audio src={audioUrl} controls className="w-full" />
              </div>

              {/* Action buttons */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => resetRecording()}
                  disabled={isUploading || isTransitioning}
                  className="px-6 py-2 rounded-lg font-medium transition-colors
                    bg-gray-200 text-gray-700 hover:bg-gray-300
                    disabled:bg-gray-100 disabled:text-gray-400"
                >
                  <X className="w-5 h-5 inline mr-2" />
                  Re-record
                </button>
                <button
                  onClick={handleConfirmRecording}
                  disabled={isTransitioning || isUploading}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors
                    ${isTransitioning || isUploading
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                    }
                  `}
                >
                  {isTransitioning || isUploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5 inline mr-2" />
                      Confirm Recording
                    </>
                  )}
                </button>
              </div>
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
                <Loader2 className="w-5 h-5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Submit All
                <Check className="w-5 h-5" />
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
          </button>
        )}
      </div>
    </div>
  )
}