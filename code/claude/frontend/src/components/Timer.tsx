interface TimerProps {
  formatted?: string // MM:SS format
  seconds: number
  isWarning: boolean
  isRunning: boolean
  onPause?: () => void
  onResume?: () => void
}

export default function Timer({
  seconds,
  isWarning,
  isRunning,
  onPause,
  onResume,
}: TimerProps) {
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const displayMinutes = minutes % 60

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all
        ${isWarning
          ? 'bg-danger-50 border-2 border-danger-500'
          : 'bg-gray-100 border-2 border-gray-300'
        }
      `}
    >
      {/* Clock Icon */}
      <svg
        className={`w-6 h-6 ${isWarning ? 'text-danger-600' : 'text-gray-600'}`}
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

      {/* Time Display */}
      <div className="flex flex-col">
        <span
          className={`font-mono text-2xl font-bold tracking-wider
            ${isWarning ? 'text-danger-600' : 'text-gray-800'}`}
        >
          {hours > 0 && `${hours}:`}
          {displayMinutes.toString().padStart(2, '0')}:
          {(seconds % 60).toString().padStart(2, '0')}
        </span>
        <span className={`text-xs ${isWarning ? 'text-danger-600' : 'text-gray-500'}`}>
          {isWarning ? 'Time running out!' : 'Time remaining'}
        </span>
      </div>

      {/* Pause/Resume Button */}
      {onPause && onResume && (
        <button
          onClick={isRunning ? onPause : onResume}
          className={`ml-2 p-2 rounded-full transition-colors
            ${isRunning
              ? 'bg-gray-200 hover:bg-gray-300 text-gray-600'
              : 'bg-primary-100 hover:bg-primary-200 text-primary-600'
            }
          `}
          title={isRunning ? 'Pause timer' : 'Resume timer'}
        >
          {isRunning ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      )}
    </div>
  )
}