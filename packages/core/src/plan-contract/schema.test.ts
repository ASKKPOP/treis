import { describe, it, expect } from 'vitest'
import {
  ScopeEntrySchema,
  PlanContractSchema,
  ClarifyResponseSchema,
  PlanOptionSchema,
  PlanOptionsResponseSchema,
  createPlanContract,
} from './schema.js'

// ---------------------------------------------------------------------------
// ScopeEntrySchema
// ---------------------------------------------------------------------------
describe('ScopeEntrySchema', () => {
  it('parses file entry with glob', () => {
    const result = ScopeEntrySchema.safeParse({ type: 'file', glob: 'src/**' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ type: 'file', glob: 'src/**' })
    }
  })

  it('parses tool entry with name', () => {
    const result = ScopeEntrySchema.safeParse({ type: 'tool', name: 'FileRead' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ type: 'tool', name: 'FileRead' })
    }
  })

  it('parses url entry with pattern', () => {
    const result = ScopeEntrySchema.safeParse({ type: 'url', pattern: 'https://api.example.com' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ type: 'url', pattern: 'https://api.example.com' })
    }
  })

  it('parses action entry with description', () => {
    const result = ScopeEntrySchema.safeParse({ type: 'action', description: 'Deploy to staging' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ type: 'action', description: 'Deploy to staging' })
    }
  })

  it('rejects unknown type', () => {
    const result = ScopeEntrySchema.safeParse({ type: 'unknown', value: 'x' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PlanContractSchema
// ---------------------------------------------------------------------------

const validContract = {
  id: '01HXYZ12345ABCDEFGHJKMNPQR',
  version: '1.0',
  intent: 'Implement the login feature',
  clarifications: [{ question: 'Which auth method?', answer: 'JWT' }],
  scopeEntries: [{ type: 'file', glob: 'src/**' }],
  successCriteria: ['Tests pass', 'Login works'],
  tokenBudget: 100_000,
  selectedOption: 'A',
  createdAt: new Date().toISOString(),
  sealedAt: new Date().toISOString(),
}

describe('PlanContractSchema', () => {
  it('parses a complete valid contract', () => {
    const result = PlanContractSchema.safeParse(validContract)
    expect(result.success).toBe(true)
  })

  it('rejects a contract missing required intent field', () => {
    const { intent: _removed, ...withoutIntent } = validContract
    const result = PlanContractSchema.safeParse(withoutIntent)
    expect(result.success).toBe(false)
  })

  it('applies default tokenBudget of 200000 when omitted', () => {
    const { tokenBudget: _removed, ...withoutBudget } = validContract
    const result = PlanContractSchema.safeParse(withoutBudget)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tokenBudget).toBe(200_000)
    }
  })

  it("applies default version '1.0' when omitted", () => {
    const { version: _removed, ...withoutVersion } = validContract
    const result = PlanContractSchema.safeParse(withoutVersion)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.version).toBe('1.0')
    }
  })
})

// ---------------------------------------------------------------------------
// PlanOptionSchema
// ---------------------------------------------------------------------------
describe('PlanOptionSchema', () => {
  const validOption = {
    label: 'A',
    archetype: 'Fast',
    title: 'Quick fix',
    description: 'Minimal changes to fix the issue',
    tradeoffs: 'Lower quality, faster delivery',
    estimatedSteps: 5,
    scopeEntries: [{ type: 'file', glob: 'src/**' }],
    successCriteria: ['Tests pass'],
  }

  it("parses option with label 'A', archetype 'Fast', estimatedSteps 5", () => {
    const result = PlanOptionSchema.safeParse(validOption)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.label).toBe('A')
      expect(result.data.archetype).toBe('Fast')
      expect(result.data.estimatedSteps).toBe(5)
    }
  })

  it("rejects label 'D' (only A/B/C allowed)", () => {
    const result = PlanOptionSchema.safeParse({ ...validOption, label: 'D' })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// PlanOptionsResponseSchema
// ---------------------------------------------------------------------------
describe('PlanOptionsResponseSchema', () => {
  const makeOption = (label: 'A' | 'B' | 'C', archetype: 'Fast' | 'Balanced' | 'Thorough') => ({
    label,
    archetype,
    title: `Option ${label}`,
    description: `Description for ${label}`,
    tradeoffs: 'Some tradeoffs',
    estimatedSteps: 5,
    scopeEntries: [{ type: 'file', glob: 'src/**' }],
    successCriteria: ['Tests pass'],
  })

  it('requires exactly 3 options', () => {
    const result = PlanOptionsResponseSchema.safeParse({
      options: [
        makeOption('A', 'Fast'),
        makeOption('B', 'Balanced'),
        makeOption('C', 'Thorough'),
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects fewer than 3 options', () => {
    const result = PlanOptionsResponseSchema.safeParse({
      options: [makeOption('A', 'Fast'), makeOption('B', 'Balanced')],
    })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// ClarifyResponseSchema
// ---------------------------------------------------------------------------
describe('ClarifyResponseSchema', () => {
  it('parses with 2 questions', () => {
    const result = ClarifyResponseSchema.safeParse({ questions: ['Q1', 'Q2'] })
    expect(result.success).toBe(true)
  })

  it('rejects empty questions array (min 2)', () => {
    const result = ClarifyResponseSchema.safeParse({ questions: [] })
    expect(result.success).toBe(false)
  })

  it('accepts 3 questions (max)', () => {
    const result = ClarifyResponseSchema.safeParse({ questions: ['Q1', 'Q2', 'Q3'] })
    expect(result.success).toBe(true)
  })

  it('rejects 4 questions (exceeds max)', () => {
    const result = ClarifyResponseSchema.safeParse({ questions: ['Q1', 'Q2', 'Q3', 'Q4'] })
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createPlanContract factory
// ---------------------------------------------------------------------------
describe('createPlanContract', () => {
  const sampleOption = {
    label: 'A' as const,
    archetype: 'Fast' as const,
    title: 'Quick implementation',
    description: 'Fast path',
    tradeoffs: 'Some shortcuts',
    estimatedSteps: 3,
    scopeEntries: [{ type: 'file' as const, glob: 'src/**' }],
    successCriteria: ['All tests pass'],
  }

  it('generates a valid ulid as id (26 chars, Crockford base32)', () => {
    const contract = createPlanContract('Build the feature', [], sampleOption)
    expect(contract.id).toHaveLength(26)
    // ULID uses Crockford base32: 0-9 and A-Z excluding I, L, O, U
    expect(contract.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('sets createdAt and sealedAt as ISO datetime strings', () => {
    const contract = createPlanContract('Build the feature', [], sampleOption)
    expect(() => new Date(contract.createdAt)).not.toThrow()
    expect(() => new Date(contract.sealedAt)).not.toThrow()
    // Should parse to valid dates
    expect(new Date(contract.createdAt).toISOString()).toBe(contract.createdAt)
    expect(new Date(contract.sealedAt).toISOString()).toBe(contract.sealedAt)
  })
})
