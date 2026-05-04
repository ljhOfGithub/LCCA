import { useState, useRef, useCallback, useEffect } from 'react'

interface UseListeningOptions {
  audioUrl: string
  autoSave?: boolean
  onAutoSave?: (replayCount: number) => Promise<void>
  autoSaveInterval?: number
}

interface UseListeningReturn {
  isPlaying: boolean
  currentTime: number
  duration: number
  replayCount: number
  hasUsedReplay: boolean
  play: () => void
  pause: () => void
  replay: () => void
  seek: (time: number) => void
  togglePlay: () => void
}

export function useListening({
  audioUrl,
  autoSave = false,
  onAutoSave,
  autoSaveInterval = 30000,
}: UseListeningOptions): UseListeningReturn {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [replayCount, setReplayCount] = useState(0)
  const [hasUsedReplay, setHasUsedReplay] = useState(false)

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize audio element
  useEffect(() => {
    if (!audioUrl) return

    const audio = new Audio(audioUrl)
    audioRef.current = audio

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.pause()
      audio.src = ''
    }
  }, [audioUrl])

  // Auto-save setup
  useEffect(() => {
    if (!autoSave || !onAutoSave) return

    autoSaveTimerRef.current = setInterval(() => {
      if (isPlaying || currentTime > 0) {
        onAutoSave(replayCount)
      }
    }, autoSaveInterval)

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [autoSave, onAutoSave, autoSaveInterval, isPlaying, currentTime, replayCount])

  const play = useCallback(() => {
    if (audioRef.current && audioUrl) {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }, [audioUrl])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }, [])

  const replay = useCallback(() => {
    if (hasUsedReplay || !audioRef.current) return

    audioRef.current.currentTime = 0
    audioRef.current.play()
    setIsPlaying(true)
    setReplayCount((prev) => prev + 1)
    setHasUsedReplay(true)
  }, [hasUsedReplay])

  const seek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause()
    } else {
      play()
    }
  }, [isPlaying, play, pause])

  return {
    isPlaying,
    currentTime,
    duration,
    replayCount,
    hasUsedReplay,
    play,
    pause,
    replay,
    seek,
    togglePlay,
  }
}