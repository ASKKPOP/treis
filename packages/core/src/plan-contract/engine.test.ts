import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PlanOption, ClarifyResponse, PlanContract } from './schema.js'

// ---------------------------------------------------------------------------
// Mock the 'ai' module so tests never hit a real LLM
// ---------------------------------------------------------------------------
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}))

// Import after vi.mock so we get the mocked version
const { generateObject } = await import('ai')
const { createPlanContractEngine } = await import('./engine.js')

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const mockModel = {} as Parameters<typeof createPlanContractEngine>[0]['model']

function makeOption(
  label: 'A' | 'B' | 'C',
  archetype: 'Fast' | 'Balanced' | 'Thorough',
): PlanOption {
  return {
    label,
    archetype,
    title: `Option ${label}`,
    description: `Description for ${label}`,
    tradeoffs: 'Some tradeoffs',
    estimatedSteps: 5,
    scopeEntries: [{ type: 'file', glob: 'src/**' }],
    successCriteria: ['Tests pass'],
  }
}

const THREE_OPTIONS = [
  makeOption('A', 'Fast'),
  makeOption('B', 'Balanced'),
  makeOption('C', 'Thorough'),
]

// ---------------------------------------------------------------------------
// Tests: clarify()
// ---------------------------------------------------------------------------
describe('PlanContractEngine.clarify()', () => {
  let tmpDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    tmpDir = await mkdtemp(join(tmpdir(), 'treis-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('Test 1: calls generateObject and returns 2-3 questions from model', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({ object: { questions: ['Q1', 'Q2'] } } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const result = await engine.clarify('Build a login feature')

    expect(mockGenerateObject).toHaveBeenCalledOnce()
    expect(result.questions).toHaveLength(2)
    expect(result.questions).toEqual(['Q1', 'Q2'])
  })

  it('Test 2: truncates to 3 questions if model returns 4+', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({
      object: { questions: ['Q1', 'Q2', 'Q3', 'Q4'] },
    } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const result = await engine.clarify('Build a login feature')

    expect(result.questions).toHaveLength(3)
    expect(result.questions).toEqual(['Q1', 'Q2', 'Q3'])
  })

  it('Test 3: passes intent as user message content to generateObject', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({ object: { questions: ['Q1', 'Q2'] } } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const intent = 'Refactor the authentication module'
    await engine.clarify(intent)

    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>
    const messages = callArgs['messages'] as Array<{ role: string; content: string }>
    expect(messages).toBeDefined()
    const userMessage = messages.find((m) => m.role === 'user')
    expect(userMessage).toBeDefined()
    expect(userMessage?.content).toContain(intent)
  })

  it('Test 4b: throws when model returns fewer than 2 questions', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({ object: { questions: ['Q1'] } } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    await expect(engine.clarify('Build something')).rejects.toThrow('at least 2 clarifying questions')
  })

  it('Test 12: works when model returns exactly 2 questions (minimum)', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({ object: { questions: ['Q1', 'Q2'] } } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const result = await engine.clarify('Deploy to production')

    expect(result.questions).toHaveLength(2)
    expect(result.questions[0]).toBe('Q1')
    expect(result.questions[1]).toBe('Q2')
  })
})

// ---------------------------------------------------------------------------
// Tests: propose()
// ---------------------------------------------------------------------------
describe('PlanContractEngine.propose()', () => {
  let tmpDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    tmpDir = await mkdtemp(join(tmpdir(), 'treis-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('Test 4: calls generateObject with PlanOptionsResponseSchema and returns 3 options', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({ object: { options: THREE_OPTIONS } } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const result = await engine.propose('Build a login feature', [])

    expect(mockGenerateObject).toHaveBeenCalledOnce()
    expect(result.options).toHaveLength(3)
    expect(result.options).toEqual(THREE_OPTIONS)
  })

  it('Test 5: includes clarifications (Q&A pairs) in messages', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({ object: { options: THREE_OPTIONS } } as never)

    const clarifications: PlanContract['clarifications'] = [
      { question: 'Which auth method?', answer: 'JWT' },
      { question: 'Mobile support needed?', answer: 'Yes' },
    ]

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    await engine.propose('Build a login feature', clarifications)

    const callArgs = mockGenerateObject.mock.calls[0][0] as Record<string, unknown>
    const messages = callArgs['messages'] as Array<{ role: string; content: string }>
    // Find the message that contains clarification answers
    const clarificationMsg = messages.find((m) => m.content.includes('JWT'))
    expect(clarificationMsg).toBeDefined()
    expect(clarificationMsg?.content).toContain('Which auth method?')
    expect(clarificationMsg?.content).toContain('Mobile support needed?')
    expect(clarificationMsg?.content).toContain('Yes')
  })

  it('Test 5b: throws when model returns != 3 options', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({
      object: { options: [makeOption('A', 'Fast'), makeOption('B', 'Balanced')] },
    } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    await expect(engine.propose('Build something', [])).rejects.toThrow('exactly 3 plan options')
  })

  it('Test 6: options have labels A, B, C with Fast/Balanced/Thorough archetypes', async () => {
    const mockGenerateObject = vi.mocked(generateObject)
    mockGenerateObject.mockResolvedValueOnce({ object: { options: THREE_OPTIONS } } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const result = await engine.propose('Build a feature', [])

    const labels = result.options.map((o) => o.label)
    const archetypes = result.options.map((o) => o.archetype)
    expect(labels).toContain('A')
    expect(labels).toContain('B')
    expect(labels).toContain('C')
    expect(archetypes).toContain('Fast')
    expect(archetypes).toContain('Balanced')
    expect(archetypes).toContain('Thorough')
  })
})

// ---------------------------------------------------------------------------
// Tests: seal()
// ---------------------------------------------------------------------------
describe('PlanContractEngine.seal()', () => {
  let tmpDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    tmpDir = await mkdtemp(join(tmpdir(), 'treis-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('Test 7: creates a PlanContract from the selected option', async () => {
    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const selectedOption = makeOption('B', 'Balanced')
    const clarifications = [{ question: 'Q1', answer: 'A1' }]

    const contract = await engine.seal('Build login', clarifications, selectedOption)

    expect(contract.intent).toBe('Build login')
    expect(contract.selectedOption).toBe('B')
    expect(contract.clarifications).toEqual(clarifications)
    expect(contract.scopeEntries).toEqual(selectedOption.scopeEntries)
    expect(contract.successCriteria).toEqual(selectedOption.successCriteria)
    expect(contract.id).toBeTruthy()
  })

  it('Test 8: writes contract JSON to planContractsDir/{id}.json', async () => {
    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const selectedOption = makeOption('A', 'Fast')

    const contract = await engine.seal('Deploy service', [], selectedOption)

    const expectedPath = join(tmpDir, `${contract.id}.json`)
    const fileStats = await stat(expectedPath)
    expect(fileStats.isFile()).toBe(true)

    const fileContent = await readFile(expectedPath, 'utf-8')
    const parsed = JSON.parse(fileContent) as PlanContract
    expect(parsed.id).toBe(contract.id)
    expect(parsed.intent).toBe('Deploy service')
  })

  it('Test 9: uses atomic write pattern — temp file does NOT exist after seal', async () => {
    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const selectedOption = makeOption('C', 'Thorough')

    const contract = await engine.seal('Refactor codebase', [], selectedOption)

    const tempPath = join(tmpDir, `${contract.id}.json.tmp`)
    await expect(stat(tempPath)).rejects.toThrow()
  })

  it('Test 10: sealed contract has tokenBudget defaulting to 200000', async () => {
    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const selectedOption = makeOption('A', 'Fast')

    const contract = await engine.seal('Quick fix', [], selectedOption)

    expect(contract.tokenBudget).toBe(200_000)
  })
})

// ---------------------------------------------------------------------------
// Test 11: Full flow — clarify -> answers -> propose -> select -> seal
// ---------------------------------------------------------------------------
describe('Full flow: clarify -> propose -> seal', () => {
  let tmpDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    tmpDir = await mkdtemp(join(tmpdir(), 'treis-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('Test 11: full flow produces a valid persisted contract', async () => {
    const mockGenerateObject = vi.mocked(generateObject)

    // clarify call returns 3 questions
    mockGenerateObject.mockResolvedValueOnce({
      object: { questions: ['Q1?', 'Q2?', 'Q3?'] },
    } as never)

    // propose call returns 3 options
    mockGenerateObject.mockResolvedValueOnce({
      object: { options: THREE_OPTIONS },
    } as never)

    const engine = createPlanContractEngine({ model: mockModel, workspace: { planContractsDir: tmpDir } })
    const intent = 'Build a complete auth system'

    // Phase A: clarify
    const clarifyResult = await engine.clarify(intent)
    expect(clarifyResult.questions).toHaveLength(3)

    // Builder answers questions
    const clarifications: PlanContract['clarifications'] = clarifyResult.questions.map(
      (q, i) => ({ question: q, answer: `Answer ${i + 1}` }),
    )

    // Phase B: propose
    const proposeResult = await engine.propose(intent, clarifications)
    expect(proposeResult.options).toHaveLength(3)

    // Builder selects option B
    const selectedOption = proposeResult.options.find((o) => o.label === 'B')!
    expect(selectedOption).toBeDefined()

    // Seal the contract
    const contract = await engine.seal(intent, clarifications, selectedOption)

    // Verify contract is valid and persisted
    expect(contract.id).toBeTruthy()
    expect(contract.id).toHaveLength(26)
    expect(contract.intent).toBe(intent)
    expect(contract.selectedOption).toBe('B')
    expect(contract.tokenBudget).toBe(200_000)
    expect(contract.clarifications).toEqual(clarifications)

    // Verify file exists
    const filePath = join(tmpDir, `${contract.id}.json`)
    const content = await readFile(filePath, 'utf-8')
    const persisted = JSON.parse(content) as PlanContract
    expect(persisted.id).toBe(contract.id)
    expect(persisted.intent).toBe(intent)

    // generateObject was called exactly twice (clarify + propose)
    expect(mockGenerateObject).toHaveBeenCalledTimes(2)
  })
})
