interface StreamTokensProps {
  tokens: string
}

export function StreamTokens({ tokens }: StreamTokensProps) {
  return (
    <pre className="font-mono text-[13px] leading-[1.6] text-[#F0F0F5] whitespace-pre-wrap">
      {tokens}
    </pre>
  )
}
