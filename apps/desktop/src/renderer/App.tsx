import { useState } from 'react'

type Screen = 'intent' | 'dialogue' | 'options' | 'contract' | 'execution' | 'result'

export function App() {
  const [screen, setScreen] = useState<Screen>('intent')

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Treis Desktop</h1>
      <p>Current screen: {screen}</p>
      {/* Screen implementations added in Plans 02 and 03 */}
    </div>
  )
}
