import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    const [get, set] = solidRuntime.createSignal(value)
    return { get, set }
  },
}))

const { demoSessionResourceSelectorStateCreate } = await import(
  "../src/ui/demo/demoSessionResourceSelectorStateCreate.js"
)
const { sessionCapturedContextInspectorStateCreate } = await import(
  "../src/ui/sessionCapturedContextInspectorStateCreate.js"
)

const digest = (character: string) => `sha256-${character.repeat(64)}`

const capturedResources = {
  descriptionCatalog: null,
  instructionSources: [
    {
      canonicalPath: "/workspace/codeline/AGENTS.md",
      content: "edited café instructions",
      digest: digest("a"),
      path: "AGENTS.md",
      precedence: 0,
      scope: ".",
      size: 20,
      source: "project" as const,
      validation: "valid" as const,
    },
    {
      canonicalPath: "/home/example/.agents/AGENTS.md",
      digest: digest("b"),
      path: "global/AGENTS.md",
      precedence: 1,
      scope: "global",
      size: 40,
      source: "global" as const,
      validation: "valid" as const,
    },
  ],
  presetName: "default",
  skills: [
    {
      bundleDigest: digest("c"),
      bundlePath: ".agents/skills/code",
      description: "Refactor and review TypeScript with the repository conventions.",
      digest: digest("d"),
      name: "code-style",
      precedence: 0,
      resources: [],
      size: 10,
      source: "project" as const,
    },
    {
      bundleDigest: digest("e"),
      bundlePath: ".agents/skills/code",
      description: "Split changes into conventional commits and push them.",
      digest: digest("f"),
      name: "commits",
      precedence: 1,
      resources: [],
      size: 10,
      source: "project" as const,
    },
  ],
  tools: {
    primary: { agentId: "demo-primary", tools: ["bash"] as const },
    selectableSubagents: [{ agentId: "demo-subagent", tools: ["webfetch"] as const }],
  },
  version: 1 as const,
}

function stateCreate(overrides: Record<string, unknown> = {}) {
  return solidRuntime.createRoot(() => {
    const demo = demoSessionResourceSelectorStateCreate(() => "ready")
    const resources = {
      ...demo,
      existingExecutionResources: () => capturedResources,
      instructionSnapshots: () => capturedResources.instructionSources,
      isMutable: () => false,
      presetName: () => capturedResources.presetName,
      ...overrides,
    }
    return sessionCapturedContextInspectorStateCreate(() => resources as never)
  })
}

test("captured instruction sources keep their path, scope, and context estimate", () => {
  const state = stateCreate()

  expect(state.instructions()).toEqual([
    {
      canonicalPath: "/workspace/codeline/AGENTS.md",
      content: "edited café instructions",
      estimatedTokens: 6,
      path: "AGENTS.md",
      scope: ".",
      size: 20,
      source: "project",
    },
    {
      canonicalPath: "/home/example/.agents/AGENTS.md",
      estimatedTokens: 10,
      path: "global/AGENTS.md",
      scope: "global",
      size: 40,
      source: "global",
    },
  ])
  expect(state.instructionEstimatedTokens()).toBe(16)
})

test("captured skills are grouped by their bundle path", () => {
  const state = stateCreate()

  expect(state.skillGroups()).toEqual([{ path: ".agents/skills/code", skillNames: ["code-style", "commits"] }])
  expect(state.presetName()).toBe("default")
})

test("captured tools list only the enabled tool names per agent", () => {
  const state = stateCreate({
    agentTools: () => [
      { agentId: "demo-primary", bash: true, isPrimary: true, name: "demo-primary", role: "primary", webfetch: false },
      {
        agentId: "demo-subagent",
        bash: false,
        isPrimary: false,
        name: "demo-subagent",
        role: "subagent",
        webfetch: true,
      },
    ],
  })

  expect(state.tools()).toEqual([
    { agentId: "demo-primary", isPrimary: true, toolNames: ["bash"] },
    { agentId: "demo-subagent", isPrimary: false, toolNames: ["webfetch"] },
  ])
})

test("the total estimate sums the system prompt and every included instruction source", () => {
  const state = stateCreate()

  // 35 prompt characters yield 9 tokens, plus 16 instruction tokens.
  expect(state.agentPromptEstimatedTokens()).toBe(9)
  expect(state.totalEstimatedTokens()).toBe(25)
})

test("a session without a captured manifest reports no capture", () => {
  const state = stateCreate({ existingExecutionResources: () => null, instructionSnapshots: () => [] })

  expect(state.hasCapture()).toBe(false)
  expect(state.instructions()).toEqual([])
  expect(state.skillGroups()).toEqual([])
})
