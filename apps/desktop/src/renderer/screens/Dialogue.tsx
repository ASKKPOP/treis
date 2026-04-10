import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { Send } from 'lucide-react'

interface Message {
  role: 'ai' | 'user'
  content: string
}

interface Clarification {
  question: string
  answer: string
}

interface DialogueProps {
  intent: string
  onComplete: (clarifications: Clarification[], intent: string) => void
}

interface StreamEvent {
  type?: string
  delta?: { type?: string; text?: string }
  text?: string
}

interface StatusEvent {
  type?: string
  questions?: string[]
}

export function Dialogue({ intent, onComplete }: DialogueProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [currentAiText, setCurrentAiText] = useState('')
  const [questions, setQuestions] = useState<string[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [isAiTyping, setIsAiTyping] = useState(true)
  const [inputText, setInputText] = useState('')
  const [questionIndex, setQuestionIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const answersRef = useRef<string[]>([])
  const questionsRef = useRef<string[]>([])

  // Keep refs in sync
  answersRef.current = answers
  questionsRef.current = questions

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentAiText])

  // Focus input when AI finishes typing
  useEffect(() => {
    if (!isAiTyping) {
      inputRef.current?.focus()
    }
  }, [isAiTyping])

  // On mount: initiate clarify query and subscribe to streams
  useEffect(() => {
    // Initiate clarification request
    window.treis.query({ action: 'clarify', data: intent })

    // Subscribe to streaming tokens
    const unsubStream = window.treis.onStream((ev: unknown) => {
      const event = ev as StreamEvent
      const tokenText =
        event?.delta?.type === 'text_delta'
          ? event.delta.text
          : event?.text ?? ''
      if (tokenText) {
        setCurrentAiText((prev) => prev + tokenText)
      }
    })

    // Subscribe to status events (clarify-response, options-response)
    const unsubStatus = window.treis.onStatus((ev: unknown) => {
      const event = ev as StatusEvent
      if (event?.type === 'clarify-response' && Array.isArray(event.questions)) {
        const qs = event.questions as string[]
        setQuestions(qs)
        questionsRef.current = qs
        setIsAiTyping(false)
        // Display first question as AI message
        if (qs.length > 0) {
          setMessages((prev) => [...prev, { role: 'ai', content: qs[0] }])
          setQuestionIndex(0)
        } else {
          // No questions — complete immediately
          onComplete([], intent)
        }
        // Clear streaming accumulator
        setCurrentAiText('')
      }
    })

    return () => {
      unsubStream()
      unsubStatus()
    }
  }, [intent, onComplete])

  function handleSend() {
    const trimmed = inputText.trim()
    if (!trimmed || isAiTyping) return

    const qs = questionsRef.current
    const currentAnswers = [...answersRef.current, trimmed]
    const nextIndex = questionIndex + 1

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }])
    setAnswers(currentAnswers)
    setInputText('')

    if (nextIndex < qs.length) {
      // More questions to answer — show next question
      setQuestionIndex(nextIndex)
      setMessages((prev) => [...prev, { role: 'ai', content: qs[nextIndex] }])
    } else {
      // All questions answered
      const clarifications: Clarification[] = qs.map((q, i) => ({
        question: q,
        answer: currentAnswers[i] ?? '',
      }))
      onComplete(clarifications, intent)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="h-screen bg-[#0F1117] flex flex-col items-center">
      <div className="w-full max-w-[640px] flex flex-col h-full mx-auto">
        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={[
                'p-4 rounded-lg text-[14px] leading-[1.5] max-w-[85%]',
                msg.role === 'ai'
                  ? 'bg-[#1A1D27] text-[#F0F0F5] self-start'
                  : 'bg-[#7C6AF7]/10 text-[#F0F0F5] self-end',
              ].join(' ')}
            >
              {msg.role === 'ai' ? (
                <span className="font-mono text-[13px] leading-[1.6]">
                  {msg.content}
                </span>
              ) : (
                msg.content
              )}
            </div>
          ))}

          {/* Streaming AI bubble */}
          {(isAiTyping && currentAiText) && (
            <div className="bg-[#1A1D27] text-[#F0F0F5] self-start p-4 rounded-lg max-w-[85%]">
              <span className="font-mono text-[13px] leading-[1.6]">
                {currentAiText}
              </span>
            </div>
          )}

          {/* Typing indicator when AI is thinking but no tokens yet */}
          {isAiTyping && !currentAiText && (
            <div className="bg-[#1A1D27] text-[#8B8FA8] self-start p-4 rounded-lg">
              <span className="font-mono text-[13px] leading-[1.6] animate-pulse">
                ...
              </span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Fixed-bottom input */}
        <div className="flex-shrink-0 px-4 py-4 border-t border-[#2A2D3E]">
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isAiTyping}
              placeholder={isAiTyping ? 'AI is thinking...' : 'Reply to the AI...'}
              className={[
                'flex-1 h-[44px] rounded-lg px-4',
                'bg-[#1A1D27] border border-[#2A2D3E]',
                'text-[14px] text-[#F0F0F5]',
                'placeholder:text-[#8B8FA8]',
                'outline-none focus:border-[#7C6AF7] focus:ring-2 focus:ring-[#7C6AF7]',
                'transition-all',
                isAiTyping ? 'opacity-50 cursor-not-allowed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <button
              onClick={handleSend}
              disabled={isAiTyping || !inputText.trim()}
              className={[
                'h-[44px] w-[44px] rounded-lg flex items-center justify-center',
                'transition-all',
                !isAiTyping && inputText.trim()
                  ? 'bg-[#7C6AF7] hover:bg-[#6B59E6] cursor-pointer text-white'
                  : 'bg-[#7C6AF7] opacity-40 cursor-not-allowed text-white',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
