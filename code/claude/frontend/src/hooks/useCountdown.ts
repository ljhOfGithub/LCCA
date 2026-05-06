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
  // Stable refs so callbacks never appear in effect deps
  const onCompleteRef = useRef(onComplete)
  const onWarningRef = useRef(onWarning)
  const warningThresholdRef = useRef(warningThreshold)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
  useEffect(() => { onWarningRef.current = onWarning }, [onWarning])
  useEffect(() => { warningThresholdRef.current = warningThreshold }, [warningThreshold])

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

  // Atomically set seconds and start — avoids the isRunning false→true flicker
  const startFrom = useCallback((newSeconds: number) => {
    setSeconds(newSeconds)
    setIsRunning(true)
    warningFiredRef.current = false
  }, [])

  // Only re-runs when isRunning toggles, not on every render
  useEffect(() => {
    if (!isRunning) return

    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false)
          onCompleteRef.current?.()
          return 0
        }

        if (!warningFiredRef.current && prev <= warningThresholdRef.current) {
          warningFiredRef.current = true
          onWarningRef.current?.(prev)
        }

        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isRunning])

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
    startFrom,
  }
}
