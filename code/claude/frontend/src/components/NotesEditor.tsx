import { useState, useEffect, useCallback } from 'react'

interface NotesEditorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoSave?: boolean
  onAutoSave?: () => void
  lastSavedAt?: Date | null
}

export default function NotesEditor({
  value,
  onChange,
  disabled = false,
  autoSave = true,
  onAutoSave,
  lastSavedAt,
}: NotesEditorProps) {
  const [isSaving, setIsSaving] = useState(false)

  const handleManualSave = useCallback(async () => {
    if (!value.trim() || !onAutoSave) return

    setIsSaving(true)
    try {
      await onAutoSave()
    } finally {
      setIsSaving(false)
    }
  }, [value, onAutoSave])

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleManualSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleManualSave])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-3">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-700">Notes</h3>
          <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-100 rounded">
            Auto-saved
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Character Count */}
          <span className="text-xs text-gray-500">
            {value.length} characters
          </span>

          {/* Last Saved */}
          {lastSavedAt && (
            <span className="text-xs text-gray-500">
              Saved at {lastSavedAt.toLocaleTimeString()}
            </span>
          )}

          {/* Save Indicator */}
          {isSaving && (
            <span className="text-xs text-primary-600 flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </span>
          )}

          {/* Manual Save Button */}
          {autoSave && onAutoSave && (
            <button
              onClick={handleManualSave}
              disabled={isSaving || !value.trim()}
              className={`px-3 py-1 text-sm rounded-md transition-colors
                ${value.trim() && !isSaving
                  ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }
              `}
            >
              Save Now
            </button>
          )}
        </div>
      </div>

      {/* Notes Textarea */}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Take notes here while listening... Your notes will be saved automatically.

Tips:
• Write down key points you hear
• Note important details
• Use abbreviations if needed"
        className={`flex-1 w-full resize-none rounded-lg p-4 text-gray-700 placeholder-gray-400
          focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
          ${disabled
            ? 'bg-gray-100 cursor-not-allowed opacity-60'
            : 'bg-gray-50 border border-gray-200 hover:border-gray-300'
          }
        `}
        style={{ minHeight: '200px' }}
      />

      {/* Footer Info */}
      <div className="mt-3 pt-3 border-t border-gray-100">
        <p className="text-xs text-gray-400">
          {autoSave
            ? 'Notes are automatically saved every 30 seconds'
            : 'Remember to save your notes before moving on'
          }
        </p>
      </div>
    </div>
  )
}