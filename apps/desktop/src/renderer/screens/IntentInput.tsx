// Stub for IntentInput screen — full implementation in plan 04-02
interface IntentInputProps {
  onSubmit: (text: string) => void
}

export function IntentInput({ onSubmit }: IntentInputProps) {
  return (
    <div className="h-full w-full bg-[#0F1117] flex items-center justify-center">
      <div className="max-w-[560px] w-full px-8">
        <textarea
          className="w-full bg-[#1A1D27] border border-[#2A2D3E] text-[#F0F0F5] rounded-lg p-4 resize-none text-[14px] leading-[1.5] placeholder-[#8B8FA8] focus:outline-none focus:border-[#7C6AF7]"
          placeholder="Describe what you want to accomplish..."
          rows={3}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && e.currentTarget.value.trim()) {
              e.preventDefault()
              onSubmit(e.currentTarget.value.trim())
            }
          }}
        />
        <div className="mt-4 flex justify-end">
          <button
            className="bg-[#7C6AF7] hover:bg-[#6B59E6] text-white font-semibold text-[14px] h-[44px] px-6 rounded-lg"
            onClick={(e) => {
              const textarea = e.currentTarget.closest('div')?.previousElementSibling as HTMLTextAreaElement
              if (textarea?.value.trim()) onSubmit(textarea.value.trim())
            }}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  )
}
