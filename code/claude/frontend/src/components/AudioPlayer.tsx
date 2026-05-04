import { useState, useRef, useCallback, useEffect } from 'react'

interface AudioPlayerProps {
  audioUrl: string
  duration: number // in seconds
  onReplayUsed?: () => void
  replayAvailable?: boolean
  disabled?: boolean
}

export default function AudioPlayer({
  audioUrl,
  duration,
  onReplayUsed,
  replayAvailable = true,
  disabled = false,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [hasReplayed, setHasReplayed] = useState(false)

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }, [])

  const handlePlay = () => {
    if (disabled) return
    audioRef.current?.play()
    setIsPlaying(true)
  }

  const handlePause = () => {
    audioRef.current?.pause()
    setIsPlaying(false)
  }

  const handleReplay = () => {
    if (hasReplayed || disabled) return
    if (audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setIsPlaying(true)
      setHasReplayed(true)
      onReplayUsed?.()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  // Auto-pause at end
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onEnded = () => {
      setIsPlaying(false)
    }

    audio.addEventListener('ended', onEnded)
    return () => audio.removeEventListener('ended', onEnded)
  }, [])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (!audioUrl) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 text-center text-gray-500">
        <svg className="w-10 h-10 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072" />
        </svg>
        <p className="text-sm">No audio file available for this task.</p>
        <p className="text-xs text-gray-400 mt-1">Please proceed with the note-taking section below.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setCurrentTime(0)
          }
        }}
      />

      {/* Player Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          {/* Play/Pause Button */}
          <button
            onClick={isPlaying ? handlePause : handlePlay}
            disabled={disabled}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all
              ${isPlaying
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            {isPlaying ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Audio Status */}
          <div>
            <div className="text-sm font-medium text-gray-700">
              {isPlaying ? 'Playing...' : 'Ready to play'}
            </div>
            <div className="text-xs text-gray-500">
              Click play to start listening
            </div>
          </div>
        </div>

        {/* Replay Button */}
        <button
          onClick={handleReplay}
          disabled={hasReplayed || disabled}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all
            ${hasReplayed
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-warning-100 text-warning-700 hover:bg-warning-200'
            }
            ${disabled ? 'opacity-50' : ''}
          `}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {hasReplayed ? 'Replay used' : `Replay (${replayAvailable && !hasReplayed ? '1' : '0'} left)`}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
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

        {/* Time Display */}
        <div className="flex justify-between text-sm text-gray-500">
          <span>{formatTime(currentTime)}</span>
          <span className="font-medium text-gray-700">{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}