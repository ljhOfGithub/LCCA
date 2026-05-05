import { useRef, useState, useEffect } from 'react'

/**
 * Audio player that works around the Chrome WebM duration-metadata bug.
 * Chrome's MediaRecorder produces WebM blobs without a valid duration header,
 * so audio.duration reports Infinity. Seeking to a far offset (1e9) forces the
 * browser to scan the file and populate the real duration.
 */
export default function WebmAudioPlayer({ src, label }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)

    const onLoaded = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      } else {
        audio.currentTime = 1e9
      }
    }
    const onSeeked = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
        audio.currentTime = 0
      }
    }
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('seeked', onSeeked)
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('seeked', onSeeked)
    }
  }, [src])

  const fmt = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) { audio.pause() } else { audio.play() }
    setIsPlaying(p => !p)
  }

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || duration === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    audio.currentTime = ratio * duration
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      {label && <p className="text-xs text-gray-400 mb-2">{label}</p>}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
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
            className="h-1.5 bg-gray-200 rounded-full overflow-hidden cursor-pointer"
            onClick={seek}
          >
            <div className="h-full bg-blue-500 rounded-full transition-none" style={{ width: `${progress}%` }} />
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
