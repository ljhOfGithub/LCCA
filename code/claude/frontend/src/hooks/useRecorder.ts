import { useState, useRef, useCallback, useEffect } from 'react'

interface UseRecorderOptions {
  maxDurationSeconds?: number
  onRecordingComplete?: (blob: Blob, duration: number) => void
}

interface UseRecorderReturn {
  isRecording: boolean
  duration: number
  audioBlob: Blob | null
  audioUrl: string | null
  isUploading: boolean
  error: string | null
  analyserRef: React.MutableRefObject<AnalyserNode | null>
  startRecording: () => Promise<void>
  stopRecording: () => void
  resetRecording: () => void
}

export function useRecorder({
  maxDurationSeconds = 180,
  onRecordingComplete,
}: UseRecorderOptions = {}): UseRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isUploading, _setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<any>(null)
  const startTimeRef = useRef<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    analyserRef.current = null
  }, [])

  const initAudioVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

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

    // Cleanup previous session
    cleanup()

    const stream = await initAudioVisualizer()
    if (!stream) return

    try {
      const RecordRTC = (await import('recordrtc')).default

      recorderRef.current = new RecordRTC(stream, {
        type: 'audio',
        mimeType: 'audio/webm',
        recorderType: RecordRTC.StereoAudioRecorder,
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
  }, [initAudioVisualizer, maxDurationSeconds, cleanup])

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

      const finalDuration = Math.floor((Date.now() - startTimeRef.current) / 1000)
      setIsRecording(false)

      // Notify callback
      if (onRecordingComplete) {
        onRecordingComplete(blob, finalDuration)
      }

      // Cleanup
      cleanup()
    })
  }, [onRecordingComplete, cleanup])

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
      cleanup()
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [cleanup, audioUrl])

  return {
    isRecording,
    duration,
    audioBlob,
    audioUrl,
    isUploading,
    error,
    analyserRef,
    startRecording,
    stopRecording,
    resetRecording,
  }
}