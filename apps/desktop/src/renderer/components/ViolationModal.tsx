import { useRef, useState } from 'react'
import { Dialog, DialogPanel, DialogTitle, DialogBackdrop } from '@headlessui/react'

interface ViolationModalProps {
  isOpen: boolean
  violation: { toolName: string; description?: string } | null
  onDecision: (decision: 'stop' | 'amend' | 'continue') => void
}

export function ViolationModal({ isOpen, violation, onDecision }: ViolationModalProps) {
  const [resolving, setResolving] = useState(false)
  const amendRef = useRef<HTMLButtonElement>(null)

  function handleDecision(decision: 'stop' | 'amend' | 'continue') {
    if (resolving) return
    setResolving(true)
    // Send decision back to main process via IPC
    window.treis.amend(decision).catch(() => {
      // amend is fire-and-forget; errors logged by main process
    })
    onDecision(decision)
    // Reset resolving state after decision is propagated
    setTimeout(() => setResolving(false), 500)
  }

  const violationDescription = violation?.description ?? violation?.toolName ?? 'perform an action'

  return (
    <Dialog
      open={isOpen}
      onClose={() => {}}
      initialFocus={amendRef}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/50" />
      <DialogPanel className="fixed inset-0 flex items-center justify-center">
        <div className="bg-[#1A1D27] border border-[#2A2D3E] rounded-lg p-6 max-w-[480px] w-full mx-4">
          <DialogTitle className="text-[20px] font-semibold text-[#F0F0F5] mb-3">
            Contract Violation
          </DialogTitle>
          <p className="text-[14px] text-[#8B8FA8]">
            A step attempted to {violationDescription} which is outside the sealed scope. Choose how
            to proceed.
          </p>
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => handleDecision('stop')}
              disabled={resolving}
              className="bg-[#E5534B] hover:bg-[#D4443C] disabled:opacity-60 disabled:cursor-not-allowed text-white h-[44px] px-4 rounded-lg text-[14px] font-semibold flex-1 transition-colors"
            >
              Stop Execution
            </button>
            <button
              ref={amendRef}
              onClick={() => handleDecision('amend')}
              disabled={resolving}
              className="bg-[#1A1D27] border border-[#2A2D3E] text-[#F0F0F5] hover:bg-[#2A2D3E] disabled:opacity-60 disabled:cursor-not-allowed h-[44px] px-4 rounded-lg text-[14px] font-semibold flex-1 transition-colors"
            >
              Amend Contract
            </button>
            <button
              onClick={() => handleDecision('continue')}
              disabled={resolving}
              className="bg-[#1A1D27] border border-[#2A2D3E] text-[#F0F0F5] hover:bg-[#2A2D3E] disabled:opacity-60 disabled:cursor-not-allowed h-[44px] px-4 rounded-lg text-[14px] font-semibold flex-1 transition-colors"
            >
              Continue Differently
            </button>
          </div>
        </div>
      </DialogPanel>
    </Dialog>
  )
}
