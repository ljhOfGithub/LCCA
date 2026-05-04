import { useState, useEffect, useRef, useCallback } from 'react'

interface RecordingControlsProps {
  isRecording: boolean
  duration: number // current recording duration in seconds
  maxDuration: number // maximum allowed duration (3 minutes = 180s)
  disabled?: boolean
  onStartRecording: () => void
  onStopRecording: () => void
}

export default function RecordingControls({
  isRecording,
  duration,
  maxDuration,
  disabled = false,
  onStartRecording,
  onStopRecording,
}: RecordingControlsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // Audio visualization
  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      if (!analyserRef.current || !ctx) return

      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      analyserRef.current.getByteTimeDomainData(dataArray)

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

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isRecording])

  const isNearLimit = duration >= maxDuration - 10 // Warning at 10 seconds left

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Time Display */}
      <div className="flex items-center justify-center mb-4">
        <div
          className={`px-4 py-2 rounded-lg flex items-center gap-2
            ${isRecording
              ? 'bg-danger-50 border-2 border-danger-500'
              : 'bg-gray-100'
            }
          `}
        >
          <svg
            className={`w-5 h-5 ${isRecording ? 'text-danger-600' : 'text-gray-600'}`}
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
            className={`font-mono text-xl font-bold
              ${isRecording ? 'text-danger-600' : 'text-gray-800'}
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
          ref={canvasRef}
          width={400}
          height={80}
          className="w-full h-20"
        />
      </div>

      {/* Recording Button */}
      <div className="flex justify-center">
        {!isRecording ? (
          <button
            onClick={onStartRecording}
            disabled={disabled}
            className={`px-8 py-3 rounded-full font-medium transition-all flex items-center gap-2
              ${disabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-danger-500 text-white hover:bg-danger-600 hover:scale-105'
              }
            `}
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="6" />
            </svg>
            Start Recording
          </button>
        ) : (
          <button
            onClick={onStopRecording}
            className="px-8 py-3 rounded-full font-medium transition-all flex items-center gap-2
              bg-success-500 text-white hover:bg-success-600 hover:scale-105 animate-pulse"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            Stop Recording
          </button>
        )}
      </div>

      {/* Recording Status */}
      {isRecording && (
        <div className="mt-4 text-center">
          <div className="flex items-center justify-center gap-2 text-danger-600">
            <span className="w-3 h-3 bg-danger-600 rounded-full animate-ping" />
            <span className="font-medium">Recording in progress...</span>
          </div>
          {isNearLimit && (
            <p className="text-sm text-warning-600 mt-2">
              Less than 10 seconds remaining. Please finish your response.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Recording state hook for managing RecordRTC
export function useAudioRecording(maxDurationSeconds: number = 180) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<any>(null)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const initAudioVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContextRef.current = new AudioContext()
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      return stream
    } catch (err) {
      setError('Failed to access microphone. Please check permissions.')
      return null
    }
  }, [])

  const startRecording = useCallback(async () => {
    setError(null)
    setAudioBlob(null)

    const stream = await initAudioVisualizer()
    if (!stream) return

    try {
      // Import RecordRTC dynamically
      const RecordRTC = (await import('recordrtc')).default

      recorderRef.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/webm',
        recorderType: RecordRTC.MediaStreamRecorder,
      })

      recorderRef.current.startRecording()
      setIsRecording(true)
      startTimeRef.current = Date.now()

      // Start duration timer
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setDuration(elapsed)

        // Auto-stop at max duration
        if (elapsed >= maxDurationSeconds) {
          stopRecording()
        }
      }, 1000)
    } catch (err) {
      setError('Failed to start recording. Please try again.')
      console.error('Recording error:', err)
    }
  }, [initAudioVisualizer, maxDurationSeconds])

  const stopRecording = useCallback(() => {
    if (!recorderRef.current) return

    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    recorderRef.current.stopRecording(() => {
      const blob = recorderRef.current.getBlob()
      setAudioBlob(blob)

      // Create URL for playback
      const url = URL.createObjectURL(blob)
      setAudioUrl(url)

      setIsRecording(false)
    })

    // Clean up audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }, [])

  const uploadRecording = useCallback(async (attemptId: string, taskId: string) => {
    if (!audioBlob) {
      throw new Error('No recording to upload')
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', audioBlob, 'recording.webm')
      formData.append('attemptId', attemptId)
      formData.append('taskId', taskId)

      const response = await fetch('/api/v1/artifacts/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const result = await response.json()
      return result.storageKey
    } finally {
      setIsUploading(false)
    }
  }, [audioBlob])

  const resetRecording = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioBlob(null)
    setAudioUrl(null)
    setDuration(0)
    setError(null)
  }, [audioUrl])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [audioUrl])

  return {
    isRecording,
    duration,
    audioBlob,
    audioUrl,
    isUploading,
    error,
    startRecording,
    stopRecording,
    uploadRecording,
    resetRecording,
    analyserRef,
  }
}