import { CheckCircle2, XCircle } from 'lucide-react'

interface ResultProps {
  contract: {
    intent: string
    successCriteria: string[]
  }
  totalSteps: number
  onNewTask: () => void
}

export function Result({ contract, totalSteps, onNewTask }: ResultProps) {
  const criteria = contract?.successCriteria ?? []
  const hasCriteria = criteria.length > 0

  // For Phase 4: all criteria pass when execution completed (totalSteps > 0), all fail if not
  const allPass = totalSteps > 0
  const allFail = totalSteps === 0

  let headingText: string
  let headingColor: string

  if (allPass) {
    headingText = 'Done'
    headingColor = 'text-[#3FB950]'
  } else if (allFail) {
    headingText = 'Execution failed'
    headingColor = 'text-[#E5534B]'
  } else {
    headingText = 'Completed with issues'
    headingColor = 'text-[#F0A04B]'
  }

  return (
    <div className="h-full w-full bg-[#0F1117] overflow-y-auto">
      <div className="max-w-[640px] mx-auto px-8 py-12 space-y-6">
        {/* Heading */}
        <h1 className={`text-[20px] font-semibold ${headingColor}`}>{headingText}</h1>

        {/* Deliverable summary */}
        <div className="space-y-2">
          <p className="text-[14px] text-[#F0F0F5]">{contract?.intent}</p>
          {totalSteps > 0 && (
            <p className="text-[14px] text-[#8B8FA8]">
              Completed in {totalSteps} {totalSteps === 1 ? 'step' : 'steps'}.
            </p>
          )}
          {totalSteps === 0 && (
            <p className="text-[14px] text-[#8B8FA8]">Execution did not complete.</p>
          )}
        </div>

        {/* Success criteria list */}
        <div className="space-y-3">
          <p className="text-[12px] font-medium text-[#8B8FA8] uppercase tracking-wider">
            Success Criteria
          </p>
          {hasCriteria ? (
            <div className="space-y-2">
              {criteria.map((criterion, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  {allPass ? (
                    <CheckCircle2
                      size={16}
                      className="text-[#3FB950] shrink-0 mt-[2px]"
                    />
                  ) : (
                    <XCircle
                      size={16}
                      className="text-[#E5534B] shrink-0 mt-[2px]"
                    />
                  )}
                  <span className="text-[14px] text-[#F0F0F5]">{criterion}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[14px] text-[#8B8FA8]">
              No success criteria were defined in this contract.
            </p>
          )}
        </div>

        {/* Start New Task button */}
        <div className="pt-2">
          <button
            onClick={onNewTask}
            className="bg-[#1A1D27] border border-[#2A2D3E] text-[#F0F0F5] hover:bg-[#2A2D3E] h-[44px] px-6 rounded-lg font-semibold text-[14px] transition-colors"
          >
            Start New Task
          </button>
        </div>
      </div>
    </div>
  )
}
