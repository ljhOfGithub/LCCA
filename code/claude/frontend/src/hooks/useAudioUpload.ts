import { useState, useCallback } from 'react'
import axios from 'axios'

interface UseAudioUploadOptions {
  attemptId: string
  taskId: string
}

interface UploadResult {
  storageKey: string
  url: string
}

interface UseAudioUploadReturn {
  isUploading: boolean
  progress: number
  error: string | null
  uploadAudio: (blob: Blob) => Promise<string>
  uploadFromUrl: (audioUrl: string) => Promise<string>
}

export function useAudioUpload({
  attemptId,
  taskId,
}: UseAudioUploadOptions): UseAudioUploadReturn {
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const uploadAudio = useCallback(async (blob: Blob): Promise<string> => {
    setIsUploading(true)
    setProgress(0)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', blob, 'recording.webm')
      formData.append('attemptId', attemptId)
      formData.append('taskId', taskId)

      const response = await axios.post<UploadResult>('/api/v1/artifacts/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setProgress(percentCompleted)
          }
        },
      })

      return response.data.storageKey
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setError(message)
      throw err
    } finally {
      setIsUploading(false)
    }
  }, [attemptId, taskId])

  const uploadFromUrl = useCallback(async (sourceUrl: string): Promise<string> => {
    setIsUploading(true)
    setProgress(0)
    setError(null)

    try {
      // Fetch the audio file
      const response = await fetch(sourceUrl)
      const blob = await response.blob()

      // Upload the blob
      return uploadAudio(blob)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload from URL failed'
      setError(message)
      throw err
    } finally {
      setIsUploading(false)
    }
  }, [uploadAudio])

  return {
    isUploading,
    progress,
    error,
    uploadAudio,
    uploadFromUrl,
  }
}