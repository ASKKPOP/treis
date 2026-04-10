import { useEffect, useRef, useState, useCallback } from 'react'
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react'
import { StreamTokens } from '../components/StreamTokens'

interface StreamEvent {
  id: string
  type: 'step' | 'tool-start' | 'tool-result' | 'verdict' | 'retry' | 'budget-warning' | 'failed'
  step: number
  data: unknown
}

interface ExecutionStreamProps {
  onComplete: (totalSteps: number) => void
  onViolation: (violation: unknown) => void
}

function genId(): string {
  return Math.random().toString(36).slice(2)
}

function VerdictBadge({ verdict }: { verdict: 'PASS' | 'FAIL' | 'FATAL' | 'RETRY' }) {
  if (verdict === 'PASS') {
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#3FB950]/20 text-[#3FB950]">
        PASS
      </span>
    )
  }
  if (verdict === 'FATAL') {
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#E5534B]/20 text-[#E5534B]">
        FATAL
      </span>
    )
  }
  if (verdict === 'FAIL') {
    return (
      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#E5534B]/20 text-[#E5534B]">
        FAIL
      </span>
    )
  }
  // RETRY
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[#F0A04B]/20 text-[#F0A04B]">
      RETRY
    </span>
  )
}

export function ExecutionStream({ onComplete, onViolation }: ExecutionStreamProps) {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [currentStep, setCurrentStep] = useState(0)
  const [tokens, setTokens] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<StreamEvent | null>(null)
  const [isComplete, setIsComplete] = useState(false)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const userScrolledRef = useRef(false)

  // Auto-scroll logic: scroll to bottom unless user has scrolled up
  function handleScroll() {
    const el = scrollContainerRef.current
    if (!el) return
    const isAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 50
    userScrolledRef.current = !isAtBottom
  }

  function scrollToBottom() {
    const el = scrollContainerRef.current
    if (!el || userScrolledRef.current) return
    el.scrollTop = el.scrollHeight
  }

  // Append event and auto-scroll
  const addEvent = useCallback((event: StreamEvent) => {
    setEvents((prev) => [...prev, event])
    setTimeout(scrollToBottom, 0)
  }, [])

  useEffect(() => {
    // onStream — token content for current step
    const unsubStream = window.treis.onStream((ev: unknown) => {
      const event = ev as { type: string; content?: string; step?: number }
      if (event.type === 'token' && typeof event.content === 'string') {
        setTokens((prev) => prev + event.content)
      }
    })

    // onToolProgress — tool-start events
    const unsubToolProgress = window.treis.onToolProgress((ev: unknown) => {
      const event = ev as { type: string; toolName?: string; input?: unknown; step?: number }
      addEvent({
        id: genId(),
        type: 'tool-start',
        step: event.step ?? currentStep,
        data: { toolName: event.toolName, input: event.input },
      })
    })

    // onToolResult — tool-result events
    const unsubToolResult = window.treis.onToolResult((ev: unknown) => {
      const event = ev as {
        type: string
        toolName?: string
        output?: unknown
        success?: boolean
        step?: number
      }
      addEvent({
        id: genId(),
        type: 'tool-result',
        step: event.step ?? currentStep,
        data: { toolName: event.toolName, output: event.output, success: event.success },
      })
    })

    // onStatus — step-complete, complete, failed, budget-warning
    const unsubStatus = window.treis.onStatus((ev: unknown) => {
      const event = ev as {
        type: string
        step?: number
        verdict?: string
        totalSteps?: number
        reason?: string
        usedTokens?: number
        budgetTokens?: number
        attempt?: number
      }

      if (event.type === 'step-complete') {
        addEvent({
          id: genId(),
          type: 'verdict',
          step: event.step ?? currentStep,
          data: { verdict: event.verdict },
        })
        setCurrentStep((prev) => prev + 1)
        setTokens('')
      } else if (event.type === 'complete') {
        setIsComplete(true)
        onComplete(event.totalSteps ?? currentStep)
      } else if (event.type === 'failed') {
        setIsComplete(true)
        addEvent({
          id: genId(),
          type: 'failed',
          step: event.step ?? currentStep,
          data: { reason: event.reason },
        })
        onComplete(0)
      } else if (event.type === 'budget-warning') {
        addEvent({
          id: genId(),
          type: 'budget-warning',
          step: currentStep,
          data: { usedTokens: event.usedTokens, budgetTokens: event.budgetTokens },
        })
      } else if (event.type === 'retry') {
        addEvent({
          id: genId(),
          type: 'retry',
          step: event.step ?? currentStep,
          data: { attempt: event.attempt, reason: event.reason },
        })
      }
    })

    // onInterrupt — violation events
    const unsubInterrupt = window.treis.onInterrupt((ev: unknown) => {
      const event = ev as { type: string; violation?: unknown }
      onViolation(event.violation ?? ev)
    })

    return () => {
      unsubStream()
      unsubToolProgress()
      unsubToolResult()
      unsubStatus()
      unsubInterrupt()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function getStepIcon(step: number) {
    if (step < currentStep) {
      return <CheckCircle2 size={16} className="text-[#3FB950] shrink-0" />
    }
    if (step === currentStep) {
      return <div className="w-2 h-2 rounded-full bg-[#7C6AF7] shrink-0 mt-[2px]" />
    }
    return <Circle size={16} className="text-[#8B8FA8] shrink-0" />
  }

  function renderEventRow(event: StreamEvent) {
    if (event.type === 'tool-start') {
      const d = event.data as { toolName?: string; input?: unknown }
      return (
        <div
          key={event.id}
          className="flex items-start gap-2 pl-8 py-1 cursor-pointer hover:bg-[#1A1D27]/50 rounded"
          onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
        >
          <span className="font-mono text-[13px] text-[#8B8FA8]">
            call {d.toolName}
          </span>
        </div>
      )
    }

    if (event.type === 'tool-result') {
      const d = event.data as { toolName?: string; output?: unknown; success?: boolean }
      return (
        <div
          key={event.id}
          className="flex items-start gap-2 pl-8 py-1 cursor-pointer hover:bg-[#1A1D27]/50 rounded"
          onClick={() => setSelectedEvent(selectedEvent?.id === event.id ? null : event)}
        >
          <span className="font-mono text-[13px] text-[#8B8FA8]">
            {d.success ? '✓' : '✗'} {d.toolName}
          </span>
        </div>
      )
    }

    if (event.type === 'verdict') {
      const d = event.data as { verdict?: string }
      return (
        <div key={event.id} className="flex items-center gap-2 pl-4 py-1">
          <VerdictBadge verdict={(d.verdict ?? 'PASS') as 'PASS' | 'FAIL' | 'FATAL' | 'RETRY'} />
        </div>
      )
    }

    if (event.type === 'retry') {
      const d = event.data as { attempt?: number; reason?: string }
      return (
        <div key={event.id} className="flex items-center gap-2 pl-4 py-1">
          <VerdictBadge verdict="RETRY" />
          <span className="text-[12px] text-[#8B8FA8]">
            Attempt {d.attempt}: {d.reason}
          </span>
        </div>
      )
    }

    if (event.type === 'budget-warning') {
      const d = event.data as { usedTokens?: number; budgetTokens?: number }
      return (
        <div key={event.id} className="flex items-center gap-2 py-1 px-2">
          <AlertTriangle size={14} className="text-[#F0A04B] shrink-0" />
          <span className="text-[12px] text-[#F0A04B]">
            Budget warning: {d.usedTokens?.toLocaleString()} / {d.budgetTokens?.toLocaleString()} tokens
          </span>
        </div>
      )
    }

    if (event.type === 'failed') {
      const d = event.data as { reason?: string }
      return (
        <div key={event.id} className="flex items-center gap-2 py-1 px-2">
          <AlertTriangle size={14} className="text-[#E5534B] shrink-0" />
          <span className="text-[12px] text-[#E5534B]">Execution failed: {d.reason}</span>
        </div>
      )
    }

    return null
  }

  // Group events by step for rendering step rows
  const stepNumbers = Array.from(new Set(events.map((e) => e.step))).sort((a, b) => a - b)
  if (events.length === 0 && currentStep === 0) {
    // empty state
  }

  function renderSelectedDetail() {
    if (!selectedEvent) {
      return (
        <div className="bg-[#1A1D27] p-4 rounded-lg border border-[#2A2D3E] h-full">
          <p className="text-[12px] font-medium text-[#8B8FA8] uppercase tracking-wider mb-3">
            Current Step Output
          </p>
          <StreamTokens tokens={tokens} />
        </div>
      )
    }

    if (selectedEvent.type === 'tool-start') {
      const d = selectedEvent.data as { toolName?: string; input?: unknown }
      return (
        <div className="bg-[#1A1D27] p-4 rounded-lg border border-[#2A2D3E] h-full overflow-y-auto">
          <p className="text-[12px] font-medium text-[#8B8FA8] uppercase tracking-wider mb-3">
            Tool Call
          </p>
          <p className="font-mono text-[13px] text-[#F0F0F5] mb-2">{d.toolName}</p>
          <p className="text-[12px] text-[#8B8FA8] mb-1">Input:</p>
          <pre className="font-mono text-[12px] text-[#F0F0F5] whitespace-pre-wrap bg-[#0F1117] p-2 rounded">
            {JSON.stringify(d.input, null, 2)}
          </pre>
        </div>
      )
    }

    if (selectedEvent.type === 'tool-result') {
      const d = selectedEvent.data as { toolName?: string; output?: unknown; success?: boolean }
      return (
        <div className="bg-[#1A1D27] p-4 rounded-lg border border-[#2A2D3E] h-full overflow-y-auto">
          <p className="text-[12px] font-medium text-[#8B8FA8] uppercase tracking-wider mb-3">
            Tool Result
          </p>
          <p className="font-mono text-[13px] text-[#F0F0F5] mb-2">
            {d.toolName}{' '}
            <span className={d.success ? 'text-[#3FB950]' : 'text-[#E5534B]'}>
              {d.success ? '(success)' : '(failed)'}
            </span>
          </p>
          <p className="text-[12px] text-[#8B8FA8] mb-1">Output:</p>
          <pre className="font-mono text-[12px] text-[#F0F0F5] whitespace-pre-wrap bg-[#0F1117] p-2 rounded">
            {JSON.stringify(d.output, null, 2)}
          </pre>
        </div>
      )
    }

    return (
      <div className="bg-[#1A1D27] p-4 rounded-lg border border-[#2A2D3E] h-full">
        <StreamTokens tokens={tokens} />
      </div>
    )
  }

  return (
    <div className="h-full w-full flex bg-[#0F1117]">
      {/* Left panel: event stream */}
      <div
        className="w-[60%] h-full overflow-y-auto border-r border-[#2A2D3E] px-6 py-8"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        <h1 className="text-[20px] font-semibold text-[#F0F0F5] mb-6">Executing</h1>

        {events.length === 0 && !isComplete ? (
          <p className="text-[14px] text-[#8B8FA8]">Waiting for first step...</p>
        ) : (
          <div className="space-y-1">
            {stepNumbers.map((step) => {
              const stepEvents = events.filter((e) => e.step === step)
              const isCurrentStep = step === currentStep
              const isCompletedStep = step < currentStep

              return (
                <div key={step}>
                  {/* Step row */}
                  <div className="flex items-center gap-3 h-[40px]">
                    {getStepIcon(step)}
                    <span className="text-[12px] font-medium text-[#8B8FA8]">Step {step + 1}</span>
                    {isCurrentStep && tokens && (
                      <span className="text-[14px] text-[#F0F0F5] truncate">Streaming...</span>
                    )}
                    {isCompletedStep && stepEvents.find((e) => e.type === 'tool-start') && (
                      <span className="text-[14px] text-[#F0F0F5] truncate font-mono text-[13px]">
                        {(stepEvents.find((e) => e.type === 'tool-start')?.data as { toolName?: string })?.toolName}
                      </span>
                    )}
                  </div>
                  {/* Events within step */}
                  {stepEvents.map(renderEventRow)}
                </div>
              )
            })}
          </div>
        )}

        {isComplete && (
          <div className="mt-6">
            <button className="bg-[#7C6AF7] text-white h-[44px] px-6 rounded-lg font-semibold text-[14px]">
              View Results
            </button>
          </div>
        )}
      </div>

      {/* Right panel: detail */}
      <div className="w-[40%] h-full overflow-y-auto p-6 bg-[#0F1117]">
        {renderSelectedDetail()}
      </div>
    </div>
  )
}
