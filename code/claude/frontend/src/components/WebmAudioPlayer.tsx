import { useRef, useState, useEffect, useCallback } from 'react'

/**
 * Audio player that works around the Chrome WebM duration-metadata bug.
 * Chrome's MediaRecorder produces WebM blobs without a valid duration header,
 * so audio.duration reports Infinity. Seeking to a far offset (1e9) forces the
 * browser to scan the file and populate the real duration.
 *
 * Progress bar supports both click-to-seek and drag-to-seek.
 */
export default function WebmAudioPlayer({ src, label }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Resolve duration via seek-to-end trick for Chrome WebM
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    isDragging.current = false

    const onLoaded = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      } else {
        audio.currentTime = 1e9
      }
    }
    const onSeeked = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(d => {
          if (d === 0) {
            // First seek-to-end resolved the duration; reset playhead
            audio.currentTime = 0
            return audio.duration
          }
          return d
        })
      }
    }
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('seeked', onSeeked)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('seeked', onSeeked)
    }
  }, [src])

  // Drag handlers attached to window so pointer can move outside the bar
  const getRatio = useCallback((clientX: number) => {
    const bar = barRef.current
    if (!bar) return 0
    const rect = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !audioRef.current || duration === 0) return
      const t = getRatio(e.clientX) * duration
      audioRef.current.currentTime = t
      setCurrentTime(t)
    }
    const onUp = () => { isDragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [duration, getRatio])

  const onBarMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    if (!audioRef.current || duration === 0) return
    const t = getRatio(e.clientX) * duration
    audioRef.current.currentTime = t
    setCurrentTime(t)
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) { audio.pause() } else { audio.play() }
    setIsPlaying(p => !p)
  }

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="bg-gray-50 rounded-lg p-3 select-none">
      {label && <p className="text-xs text-gray-400 mb-2">{label}</p>}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => {
          if (!isDragging.current && audioRef.current)
            setCurrentTime(audioRef.current.currentTime)
        }}
        onEnded={() => setIsPlaying(false)}
      />
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 flex-shrink-0"
        >
          {isPlaying
            ? <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
            : <svg className="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>}
        </button>
        <div className="flex-1 min-w-0">
          <div
            ref={barRef}
            className="h-2 bg-gray-200 rounded-full overflow-hidden cursor-pointer"
            onMouseDown={onBarMouseDown}
          >
            <div
              className="h-full bg-blue-500 rounded-full pointer-events-none"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{fmt(currentTime)}</span>
            <span>{duration > 0 ? fmt(duration) : '--:--'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
