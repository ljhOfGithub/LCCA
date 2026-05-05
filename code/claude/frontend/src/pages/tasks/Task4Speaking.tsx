import { useState, useEffect, useRef, useCallback } from 'react'
import RecordingControls, { useAudioRecording } from '../../components/RecordingControls'

// Playback component for just-recorded WebM blobs — Chrome lacks duration metadata.
function RecordingPlayback({ src, recordedDuration }: { src?: string; recordedDuration: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [realDuration, setRealDuration] = useState(recordedDuration)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !src) return
    setCurrentTime(0)
    setRealDuration(recordedDuration)
    setIsPlaying(false)
    isDragging.current = false

    const onLoaded = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setRealDuration(audio.duration)
      else audio.currentTime = 1e9
    }
    const onSeeked = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setRealDuration(d => { if (d === recordedDuration) { audio.currentTime = 0; return audio.duration } return d })
      }
    }
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('seeked', onSeeked)
    return () => { audio.removeEventListener('loadedmetadata', onLoaded); audio.removeEventListener('seeked', onSeeked) }
  }, [src, recordedDuration])

  const getRatio = useCallback((clientX: number) => {
    const bar = barRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !audioRef.current || realDuration === 0) return
      const t = getRatio(e.clientX) * realDuration
      audioRef.current.currentTime = t
      setCurrentTime(t)
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [realDuration, getRatio])

  const onBarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    if (!audioRef.current || realDuration === 0) return
    const t = getRatio(e.clientX) * realDuration
    audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const progress = realDuration > 0 ? (currentTime / realDuration) * 100 : 0

  return (
    <div className="bg-gray-50 rounded-lg p-4 select-none">
      <audio ref={audioRef} src={src}
        onTimeUpdate={() => { if (!isDragging.current && audioRef.current) setCurrentTime(audioRef.current.currentTime) }}
        onEnded={() => setIsPlaying(false)} />
      <div className="flex items-center gap-3">
        <button onClick={() => { isPlaying ? audioRef.current?.pause() : audioRef.current?.play(); setIsPlaying(p => !p) }}
          className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700">
          {isPlaying
            ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>
            : <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
        </button>
        <div className="flex-1">
          <div ref={barRef} className="h-2 bg-gray-200 rounded-full overflow-hidden cursor-pointer" onMouseDown={onBarMouseDown}>
            <div className="h-full bg-blue-500 rounded-full pointer-events-none" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{fmt(currentTime)}</span>
            <span>{fmt(realDuration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

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
  const [recordingDurations, setRecordingDurations] = useState<{ [key: string]: number }>({}) // questionId -> seconds
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

  const handleReRecord = useCallback(() => {
    if (!currentQuestion) return
    resetRecording()
    setRecordings((prev) => {
      const next = { ...prev }
      delete next[currentQuestion.id]
      return next
    })
    setRecordingBlobUrls((prev) => {
      const next = { ...prev }
      delete next[currentQuestion.id]
      return next
    })
    setRecordingDurations((prev) => {
      const next = { ...prev }
      delete next[currentQuestion.id]
      return next
    })
  }, [currentQuestion, resetRecording])

  const handleStopRecording = useCallback(async () => {
    stopRecording()
  }, [stopRecording])

  const handleConfirmRecording = useCallback(async () => {
    if (!currentQuestion || !audioUrl) return

    const blobUrlSnapshot = audioUrl
    setIsTransitioning(true)
    try {
      const storageKey = await uploadRecording(attemptId, taskId)

      const newRecordings = { ...recordings, [currentQuestion.id]: storageKey }
      setRecordings(newRecordings)
      setRecordingBlobUrls((prev) => ({ ...prev, [currentQuestion.id]: blobUrlSnapshot }))
      setRecordingDurations((prev) => ({ ...prev, [currentQuestion.id]: duration }))

      // Persist after each confirmed recording so state survives task navigation
      if (saveResponse) {
        await saveResponse(JSON.stringify({ recordingMap: newRecordings })).catch(console.error)
      }

      // Auto-submit when the last question is confirmed
      const allDone = questions.every((q) => newRecordings[q.id] !== undefined)
      if (allDone) {
        setIsSubmitting(true)
        try {
          const audioKeys = questions.map((q) => newRecordings[q.id])
          await onSubmit(audioKeys)
          onComplete()
        } finally {
          setIsSubmitting(false)
        }
      }
    } catch (err) {
      console.error('Failed to save recording:', err)
    } finally {
      setIsTransitioning(false)
    }
  }, [currentQuestion, audioUrl, uploadRecording, attemptId, taskId, recordings, duration, saveResponse, questions, onSubmit, onComplete])

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1)
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
            // Recording confirmed — show playback + re-record option (unless task already submitted)
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="flex items-center gap-2 text-success-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Recording saved</span>
                  <span className="text-xs text-gray-400 ml-2">
                    ({formatTime(recordingDurations[currentQuestion?.id] ?? duration)})
                  </span>
                </div>
              </div>

              <RecordingPlayback
                src={recordingBlobUrls[currentQuestion?.id] || audioUrl || undefined}
                recordedDuration={recordingDurations[currentQuestion?.id] ?? duration}
              />

              {!disabled && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleReRecord}
                    className="px-5 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    Re-record this question
                  </button>
                </div>
              )}
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

          {/* After stopping: playback + re-record / confirm buttons */}
          {audioUrl && !isQuestionAnswered && !isRecording && (
            <div className="mt-4 space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-2 font-medium">录音回放 — 确认前可以先听一遍</p>
                <audio src={audioUrl} controls className="w-full" />
              </div>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => resetRecording()}
                  disabled={isTransitioning || isUploading}
                  className="px-5 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Re-record
                </button>
                <button
                  onClick={handleConfirmRecording}
                  disabled={isTransitioning || isUploading}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors text-sm
                    ${isTransitioning || isUploading
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-success-600 text-white hover:bg-success-700'
                    }
                  `}
                >
                  {isTransitioning || isUploading ? 'Saving...' : 'Confirm Recording'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-end pt-4 border-t border-gray-200">
        {/* Next Button — only shown when there are more questions */}
        {!isLastQuestion && (
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