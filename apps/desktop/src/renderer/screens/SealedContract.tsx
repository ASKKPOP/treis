import { useState } from 'react'
import { Circle } from 'lucide-react'

interface SealedContractProps {
  contract: {
    id: string
    intent: string
    scopeEntries: Array<{ type: string; [key: string]: string }>
    successCriteria: string[]
    tokenBudget: number
    selectedOption: string
  }
  onBegin: () => void
}

function getScopeEntryValue(entry: { type: string; [key: string]: string }): string {
  switch (entry.type) {
    case 'file':
      return entry.glob ?? ''
    case 'tool':
      return entry.name ?? ''
    case 'url':
      return entry.pattern ?? ''
    case 'action':
      return entry.description ?? ''
    default:
      return Object.entries(entry)
        .filter(([k]) => k !== 'type')
        .map(([, v]) => v)
        .join(' ')
  }
}

export function SealedContract({ contract, onBegin }: SealedContractProps) {
  const [state, setState] = useState<'reviewing' | 'beginning'>('reviewing')

  function handleBegin() {
    setState('beginning')
    onBegin()
  }

  return (
    <div className="h-full w-full bg-[#0F1117] overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-8 py-12 space-y-6">
        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-[20px] font-semibold text-[#F0F0F5]">Sealed Contract</h1>
          <p className="text-[14px] text-[#8B8FA8]">
            Review the scope before execution begins. You cannot change this without amending.
          </p>
        </div>

        {/* Scope Entries */}
        {contract?.scopeEntries && contract.scopeEntries.length > 0 && (
          <div className="space-y-3">
            <p className="text-[12px] font-medium text-[#8B8FA8] uppercase tracking-wider">Scope</p>
            <div className="space-y-2">
              {contract.scopeEntries.map((entry, idx) => (
                <div
                  key={idx}
                  className="bg-[#1A1D27] p-3 rounded border border-[#2A2D3E]"
                >
                  <span className="font-mono text-[13px] leading-[1.6] text-[#F0F0F5]">
                    [{entry.type}] {getScopeEntryValue(entry)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success Criteria */}
        {contract?.successCriteria && contract.successCriteria.length > 0 && (
          <div className="space-y-3">
            <p className="text-[12px] font-medium text-[#8B8FA8] uppercase tracking-wider">
              Success Criteria
            </p>
            <div className="space-y-2">
              {contract.successCriteria.map((criterion, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <Circle className="text-[#8B8FA8] mt-[2px] shrink-0" size={16} />
                  <span className="text-[14px] text-[#F0F0F5]">{criterion}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Begin Execution button */}
        <div className="pt-2">
          <button
            onClick={handleBegin}
            disabled={state === 'beginning'}
            className="bg-[#7C6AF7] hover:bg-[#6B59E6] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-[14px] h-[44px] px-6 rounded-lg min-w-[160px] flex items-center justify-center gap-2 transition-colors"
          >
            {state === 'beginning' ? (
              <>
                <svg
                  className="animate-spin w-4 h-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Starting...
              </>
            ) : (
              'Begin Execution'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
