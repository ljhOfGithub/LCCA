import { useEffect, useRef, useCallback } from 'react'

interface UseAutoSaveOptions {
  onSave: (data: string) => Promise<void>
  interval?: number // milliseconds
  enabled?: boolean
}

export function useAutoSave({
  onSave,
  interval = 30000, // 30 seconds default
  enabled = true,
}: UseAutoSaveOptions) {
  const lastSavedRef = useRef<string>('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingSaveRef = useRef(false)

  const save = useCallback(
    async (data: string) => {
      if (data === lastSavedRef.current) {
        return // No changes since last save
      }

      try {
        await onSave(data)
        lastSavedRef.current = data
        pendingSaveRef.current = false
      } catch (error) {
        console.error('Auto-save failed:', error)
        pendingSaveRef.current = true
      }
    },
    [onSave]
  )

  const saveNow = useCallback(
    async (data: string) => {
      // Force save immediately
      lastSavedRef.current = ''
      await save(data)
    },
    [save]
  )

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    timerRef.current = setInterval(() => {
      // Trigger save check - the actual data should be passed via save()
    }, interval)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [interval, enabled])

  return {
    save,
    saveNow,
    isPending: () => pendingSaveRef.current,
  }
}