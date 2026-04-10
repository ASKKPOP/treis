import { useState, useEffect, useRef } from 'react'

interface PlanOption {
  label: 'A' | 'B' | 'C'
  archetype: 'Fast' | 'Balanced' | 'Thorough'
  title: string
  description: string
  tradeoffs: string
  estimatedSteps: number
  scopeEntries: unknown[]
  successCriteria: string[]
}

interface PlanOptionsProps {
  intent: string
  clarifications: Array<{ question: string; answer: string }>
  onSelected: (selectedOption: PlanOption) => void
}

interface StatusEvent {
  type?: string
  options?: PlanOption[]
}

export function PlanOptions({ intent, clarifications, onSelected }: PlanOptionsProps) {
  const [options, setOptions] = useState<PlanOption[]>([])
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const firstCardRef = useRef<HTMLDivElement>(null)
  const optionsRef = useRef<PlanOption[]>([])
  optionsRef.current = options

  useEffect(() => {
    // Request plan options from worker
    window.treis.query({ action: 'propose', data: { intent, clarifications } })

    // Subscribe to status events for options-response
    const unsubStatus = window.treis.onStatus((ev: unknown) => {
      const event = ev as StatusEvent
      if (event?.type === 'options-response' && Array.isArray(event.options)) {
        setOptions(event.options as PlanOption[])
        setIsLoading(false)
      }
    })

    return () => {
      unsubStatus()
    }
  }, [intent, clarifications])

  // Focus first card when options load
  useEffect(() => {
    if (!isLoading) {
      firstCardRef.current?.focus()
    }
  }, [isLoading])

  // Keyboard selection: a, b, c
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key.toLowerCase()
      if (!['a', 'b', 'c'].includes(key)) return
      const label = key.toUpperCase() as 'A' | 'B' | 'C'
      const option = optionsRef.current.find((o) => o.label === label)
      if (option) {
        setSelectedLabel(label)
        onSelected(option)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onSelected])

  function handleSelect(option: PlanOption) {
    setSelectedLabel(option.label)
    onSelected(option)
  }

  return (
    <div className="min-h-screen bg-[#0F1117] flex flex-col items-center px-8 pt-16">
      <div className="w-full max-w-[960px]">
        {/* Heading */}
        <h1 className="text-[20px] font-semibold text-[#F0F0F5] leading-[1.2] mb-2">
          Choose a plan
        </h1>
        <p className="text-[14px] text-[#8B8FA8] mb-8">
          Pick the approach that fits your situation. This seals the scope.
        </p>

        {/* Loading state */}
        {isLoading && (
          <div className="grid grid-cols-3 gap-6">
            {['A', 'B', 'C'].map((label) => (
              <div
                key={label}
                className="h-[160px] bg-[#1A1D27] border border-[#2A2D3E] rounded-lg p-4 animate-pulse"
              />
            ))}
          </div>
        )}

        {/* Options cards */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-6">
            {options.map((option, idx) => {
              const isSelected = selectedLabel === option.label
              const isHovered = hoveredLabel === option.label

              return (
                <div
                  key={option.label}
                  ref={idx === 0 ? firstCardRef : undefined}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(option)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelect(option)
                    }
                  }}
                  onMouseEnter={() => setHoveredLabel(option.label)}
                  onMouseLeave={() => setHoveredLabel(null)}
                  className={[
                    'h-[160px] rounded-lg p-4 cursor-pointer',
                    'flex flex-col justify-between',
                    'transition-all outline-none',
                    'focus:ring-2 focus:ring-[#7C6AF7]',
                    isSelected
                      ? 'border-l-4 border-l-[#7C6AF7] border-t border-r border-b border-[#2A2D3E] bg-[#1E2130]'
                      : isHovered
                        ? 'border-l-2 border-l-[#7C6AF7] border-t border-r border-b border-[#2A2D3E] bg-[#1E2130]'
                        : 'bg-[#1A1D27] border border-[#2A2D3E]',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* Top: badge + archetype */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[12px] font-medium bg-[#7C6AF7]/20 text-[#7C6AF7] px-2 py-0.5 rounded">
                      {option.label}
                    </span>
                    <span className="text-[12px] font-medium text-[#8B8FA8]">
                      {option.archetype}
                    </span>
                  </div>

                  {/* Plan title */}
                  <div>
                    <h3 className="text-[20px] font-semibold text-[#F0F0F5] leading-[1.2] mb-1 truncate">
                      {option.title}
                    </h3>

                    {/* Tradeoff description (2-line clamp) */}
                    <p
                      className="text-[14px] text-[#8B8FA8] leading-[1.5]"
                      style={{
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {option.tradeoffs}
                    </p>
                  </div>

                  {/* Keyboard shortcut hint */}
                  <div className="text-[12px] text-[#8B8FA8] mt-1">
                    Press {option.label}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
