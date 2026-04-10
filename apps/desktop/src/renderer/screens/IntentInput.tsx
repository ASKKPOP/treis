import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Loader2 } from 'lucide-react'

interface IntentInputProps {
  onSubmit: (intent: string) => void
}

export function IntentInput({ onSubmit }: IntentInputProps) {
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'focused' | 'submitting'>('idle')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function handleFocus() {
    if (state !== 'submitting') setState('focused')
  }

  function handleBlur() {
    if (state !== 'submitting') setState('idle')
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setText(value)
    // Auto-resize: calculate rows (max 4)
    const rows = Math.min(4, Math.max(1, value.split('\n').length))
    e.target.rows = rows
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleSubmit() {
    if (!text.trim() || state === 'submitting') return
    setState('submitting')
    onSubmit(text.trim())
  }

  const isSubmitting = state === 'submitting'
  const isFocused = state === 'focused'
  const canSubmit = text.trim().length > 0 && !isSubmitting

  return (
    <div className="min-h-screen bg-[#0F1117] flex flex-col items-center justify-start pt-[33vh] px-8">
      <div className="w-full max-w-[560px] flex flex-col gap-4">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={isSubmitting}
          placeholder="Describe what you want to accomplish..."
          maxLength={4000}
          className={[
            'w-full resize-none rounded-lg p-4',
            'bg-[#1A1D27] border text-[#F0F0F5]',
            'placeholder:text-[#8B8FA8]',
            'text-[14px] font-[Inter,system-ui,sans-serif] leading-[1.5]',
            'outline-none transition-all',
            isFocused
              ? 'border-[#7C6AF7] ring-2 ring-[#7C6AF7]'
              : 'border-[#2A2D3E]',
            isSubmitting ? 'opacity-50 cursor-not-allowed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={[
            'h-[44px] min-w-[100px] self-end rounded-lg px-6',
            'text-[14px] font-semibold text-white',
            'transition-all flex items-center justify-center gap-2',
            canSubmit
              ? 'bg-[#7C6AF7] hover:bg-[#6B59E6] cursor-pointer'
              : 'bg-[#7C6AF7] opacity-40 cursor-not-allowed',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isSubmitting ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            'Start'
          )}
        </button>
      </div>
    </div>
  )
}
