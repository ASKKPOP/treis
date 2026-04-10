// Stub for PlanOptions screen — full implementation in plan 04-02
interface PlanOptionsProps {
  intent: string
  clarifications: Array<{ question: string; answer: string }>
  onSelected: (option: unknown) => void
}

export function PlanOptions({ intent: _intent, clarifications: _clarifications, onSelected }: PlanOptionsProps) {
  return (
    <div className="h-full w-full bg-[#0F1117] flex items-center justify-center">
      <div className="max-w-[640px] w-full px-8 text-center">
        <p className="text-[14px] text-[#8B8FA8] mb-4">Loading plan options...</p>
        <button
          className="bg-[#7C6AF7] hover:bg-[#6B59E6] text-white font-semibold text-[14px] h-[44px] px-6 rounded-lg"
          onClick={() => onSelected({ label: 'A' })}
        >
          Select Plan A
        </button>
      </div>
    </div>
  )
}
