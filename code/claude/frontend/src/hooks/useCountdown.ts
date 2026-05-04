import { useState, useEffect, useCallback, useRef } from 'react'

interface UseCountdownOptions {
  initialSeconds: number
  onComplete?: () => void
  onWarning?: (remainingSeconds: number) => void
  warningThreshold?: number // seconds
}

export function useCountdown({
  initialSeconds,
  onComplete,
  onWarning,
  warningThreshold = 300, // 5 minutes
}: UseCountdownOptions) {
  const [seconds, setSeconds] = useState(initialSeconds)
  const [isRunning, setIsRunning] = useState(false)
  const warningFiredRef = useRef(false)

  const start = useCallback(() => {
    setIsRunning(true)
  }, [])

  const pause = useCallback(() => {
    setIsRunning(false)
  }, [])

  const reset = useCallback((newSeconds?: number) => {
    setSeconds(newSeconds ?? initialSeconds)
    setIsRunning(false)
    warningFiredRef.current = false
  }, [initialSeconds])

  useEffect(() => {
    if (!isRunning) return

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false)
          onComplete?.()
          return 0
        }

        // Fire warning once when threshold reached
        if (!warningFiredRef.current && prev <= warningThreshold) {
          warningFiredRef.current = true
          onWarning?.(prev)
        }

        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isRunning, onComplete, onWarning, warningThreshold])

  // Format time as MM:SS
  const formatted = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`

  const isWarning = seconds <= warningThreshold

  return {
    seconds,
    formatted,
    isRunning,
    isWarning,
    start,
    pause,
    reset,
  }
}