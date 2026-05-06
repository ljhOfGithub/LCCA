import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import CharacterCount from '@tiptap/extension-character-count'

interface RichTextEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  wordLimit?: {
    min: number
    max: number
  }
  disabled?: boolean
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder = 'Start writing...',
  wordLimit,
  disabled = false,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder,
      }),
      CharacterCount.configure({
        wordCounter: (text) => text.split(/\s+/).filter((w) => w !== '').length,
      }),
    ],
    content,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // TipTap only reads `editable` at init; sync it whenever the prop changes
  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  if (!editor) {
    return null
  }

  const characterCount = editor.storage.characterCount.characters()
  // Compute word count directly from ProseMirror doc to avoid TipTap CharacterCount quirks
  const wordCount = editor.state.doc
    .textBetween(0, editor.state.doc.content.size, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length

  const isOverLimit = wordLimit ? wordCount > wordLimit.max : false
  const isUnderLimit = wordLimit ? wordCount < wordLimit.min : false

  return (
    <div className={`border border-gray-300 rounded-lg overflow-hidden
      ${disabled ? 'bg-gray-100' : 'bg-white'}`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 border-b border-gray-300">
        {/* Text Format */}
        <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`toolbar-btn ${editor.isActive('bold') ? 'bg-gray-300' : ''}`}
            title="Bold (Ctrl+B)"
          >
            <span className="font-bold">B</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`toolbar-btn ${editor.isActive('italic') ? 'bg-gray-300' : ''}`}
            title="Italic (Ctrl+I)"
          >
            <span className="italic">I</span>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`toolbar-btn ${editor.isActive('underline') ? 'bg-gray-300' : ''}`}
            title="Underline (Ctrl+U)"
          >
            <span className="underline">U</span>
          </button>
        </div>

        {/* List Format */}
        <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`toolbar-btn ${editor.isActive('bulletList') ? 'bg-gray-300' : ''}`}
            title="Bullet List"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`toolbar-btn ${editor.isActive('orderedList') ? 'bg-gray-300' : ''}`}
            title="Numbered List"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" />
            </svg>
          </button>
        </div>

        {/* Alignment */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            className={`toolbar-btn ${editor.isActive({ textAlign: 'left' }) ? 'bg-gray-300' : ''}`}
            title="Align Left"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M4 12h10M4 18h16" />
            </svg>
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            className={`toolbar-btn ${editor.isActive({ textAlign: 'center' }) ? 'bg-gray-300' : ''}`}
            title="Align Center"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 6h16M7 12h10M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Word Count */}
        {wordLimit && (
          <div className="ml-auto flex items-center gap-2 text-sm">
            <span className={isUnderLimit ? 'text-warning-600' : isOverLimit ? 'text-danger-600' : 'text-gray-600'}>
              {wordCount} / {wordLimit.max} words
            </span>
            {isOverLimit && (
              <span className="text-danger-600 font-medium">Over limit!</span>
            )}
          </div>
        )}
      </div>

      {/* Editor Content */}
      <EditorContent
        editor={editor}
        className={`prose prose-sm max-w-none p-4 min-h-[300px] focus-within:outline-none
          ${disabled ? 'opacity-60' : ''}`}
      />

      {/* Footer Stats */}
      <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
        <span>{wordCount} words</span>
        <span>{characterCount} characters</span>
      </div>

      <style>{`
        .toolbar-btn {
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: background-color 0.15s;
        }
        .toolbar-btn:hover {
          background-color: #e5e7eb;
        }
        .ProseMirror {
          outline: none;
          min-height: 200px;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  )
}