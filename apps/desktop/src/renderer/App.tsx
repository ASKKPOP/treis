import { useState, useCallback, useEffect, useRef } from 'react'
import { IntentInput } from './screens/IntentInput'
import { Dialogue } from './screens/Dialogue'
import { PlanOptions } from './screens/PlanOptions'
import { SealedContract } from './screens/SealedContract'
import { ExecutionStream } from './screens/ExecutionStream'
import { Result } from './screens/Result'
import { ViolationModal } from './components/ViolationModal'

type Screen = 'intent' | 'dialogue' | 'options' | 'contract' | 'execution' | 'result'

export function App() {
  const [screen, setScreen] = useState<Screen>('intent')
  const [intent, setIntent] = useState('')
  const [clarifications, setClarifications] = useState<Array<{ question: string; answer: string }>>([])
  const [selectedOption, setSelectedOption] = useState<unknown>(null)
  const [contract, setContract] = useState<unknown>(null)
  const [totalSteps, setTotalSteps] = useState(0)

  // Violation modal state
  const [violationOpen, setViolationOpen] = useState(false)
  const [currentViolation, setCurrentViolation] = useState<unknown>(null)

  // Track which element triggered the violation modal for focus restoration
  const preViolationFocusRef = useRef<HTMLElement | null>(null)

  const handleViolation = useCallback((violation: unknown) => {
    preViolationFocusRef.current = document.activeElement as HTMLElement
    setCurrentViolation(violation)
    setViolationOpen(true)
  }, [])

  const handleViolationDecision = useCallback((decision: 'stop' | 'amend' | 'continue') => {
    setViolationOpen(false)
    setCurrentViolation(null)
    // Restore focus to the element that triggered the modal
    setTimeout(() => {
      preViolationFocusRef.current?.focus()
      preViolationFocusRef.current = null
    }, 0)
    if (decision === 'stop') {
      setScreen('result')
    }
    // 'amend' and 'continue' are handled by IPC bridge (worker resumes)
  }, [])

  const resetToStart = useCallback(() => {
    setScreen('intent')
    setIntent('')
    setClarifications([])
    setSelectedOption(null)
    setContract(null)
    setTotalSteps(0)
  }, [])

  // Subscribe to contract-sealed event from worker so SealedContract can populate
  useEffect(() => {
    if (screen !== 'contract') return
    const unsub = window.treis.onStatus((ev: unknown) => {
      const event = ev as { type: string; contract?: unknown }
      if (event.type === 'contract-sealed' && event.contract) {
        setContract(event.contract)
      }
    })
    return unsub
  }, [screen])

  // When transitioning to contract screen, trigger the query
  useEffect(() => {
    if (screen !== 'contract' || !selectedOption) return
    window.treis.query({
      action: 'execute',
      data: { intent, clarifications, selectedOption },
    }).catch(() => {
      // Error handled by status events
    })
  }, [screen, selectedOption, intent, clarifications])

  return (
    <div
      className="h-screen w-screen bg-[#0F1117] text-[#F0F0F5]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {screen === 'intent' && (
        <IntentInput
          onSubmit={(text) => {
            setIntent(text)
            setScreen('dialogue')
          }}
        />
      )}
      {screen === 'dialogue' && (
        <Dialogue
          intent={intent}
          onComplete={(clarifs) => {
            setClarifications(clarifs)
            setScreen('options')
          }}
        />
      )}
      {screen === 'options' && (
        <PlanOptions
          intent={intent}
          clarifications={clarifications}
          onSelected={(option) => {
            setSelectedOption(option)
            setScreen('contract')
          }}
        />
      )}
      {screen === 'contract' && (
        <SealedContract
          contract={contract as {
            id: string
            intent: string
            scopeEntries: Array<{ type: string; [key: string]: string }>
            successCriteria: string[]
            tokenBudget: number
            selectedOption: string
          }}
          onBegin={() => setScreen('execution')}
        />
      )}
      {screen === 'execution' && (
        <ExecutionStream
          onComplete={(steps) => {
            setTotalSteps(steps)
            setScreen('result')
          }}
          onViolation={handleViolation}
        />
      )}
      {screen === 'result' && (
        <Result
          contract={contract as { intent: string; successCriteria: string[] }}
          totalSteps={totalSteps}
          onNewTask={resetToStart}
        />
      )}
      <ViolationModal
        isOpen={violationOpen}
        violation={currentViolation as { toolName: string; description?: string } | null}
        onDecision={handleViolationDecision}
      />
    </div>
  )
}
