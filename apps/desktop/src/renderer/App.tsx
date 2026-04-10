import { useState } from 'react'
import { IntentInput } from './screens/IntentInput'
import { Dialogue } from './screens/Dialogue'
import { PlanOptions } from './screens/PlanOptions'

type Screen = 'intent' | 'dialogue' | 'options' | 'contract' | 'execution' | 'result'

export function App() {
  const [screen, setScreen] = useState<Screen>('intent')
  const [intent, setIntent] = useState('')
  const [clarifications, setClarifications] = useState<Array<{ question: string; answer: string }>>([])
  const [selectedOption, setSelectedOption] = useState<unknown>(null)
  const [contract, setContract] = useState<unknown>(null)

  return (
    <div className="h-screen w-screen bg-[#0F1117] text-[#F0F0F5] font-sans">
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
        <div className="p-8 text-center">Sealed Contract (Plan 03)</div>
      )}
      {screen === 'execution' && (
        <div className="p-8 text-center">Execution (Plan 03)</div>
      )}
      {screen === 'result' && (
        <div className="p-8 text-center">Result (Plan 03)</div>
      )}
    </div>
  )
}
