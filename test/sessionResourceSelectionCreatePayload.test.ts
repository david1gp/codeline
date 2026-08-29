import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import * as v from "valibot"

mock.module("solid-js", () => solidRuntime)

const { sessionTargetSelectorStateCreate } = await import("../src/ui/sessionTargetSelectorStateCreate.js")
const { sessionCreateRequestSchema } = await import("../src/session/schema/sessionCreateRequestSchema.js")

const representation = <T extends object>(body: T, revision = 1) => ({
  ...body,
  etag: `"${revision}"`,
  revision,
  schemaVersion: "v2",
})

const response = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init)

async function effectsSettle() {
  for (let index = 0; index < 12; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const servers = representation({ servers: [{ id: "example-server", name: "Example Server" }] })
const agents = representation({
  agents: [
    {
      id: "example-agent-primary",
      name: "Primary Agent",
      parentAgentId: null,
      role: "primary",
      serverId: "example-server",
    },
  ],
})
const agentDetail = representation({
  agent: {
    configuration: {
      apiKey: "$CODEX_LB_API_TOKEN",
      baseUrl: "https://codex.example.com/v1",
      model: "codex-model",
      provider: "codex-lb",
    },
    id: "example-agent-primary",
    name: "Primary Agent",
    role: "primary",
    serverId: "example-server",
  },
})

const executionSelection = {
  tools: {
    primary: { agentId: "example-agent-primary", tools: { bash: true, webfetch: false } },
    selectableSubagents: [{ agentId: "example-agent-explore", tools: { bash: false, webfetch: true } }],
  },
  version: 1 as const,
}

const skillSelection = {
  override: { disabledSkills: ["commits"], enabledSkills: ["agent-browser"] },
  presetName: "focused",
}

function stateCreate(options: {
  activeProjectId?: string | null
  bodies: Array<Record<string, unknown>>
  pendingAgentPrompt?: () => string | undefined
  pendingExecutionSelection?: () => typeof executionSelection | undefined
  pendingInstructionOverrides?: () => Readonly<Record<string, string>>
  pendingSkillSelection?: () => typeof skillSelection | undefined
}) {
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: () => `example-account-${Math.random()}`,
      activeProjectId: () => options.activeProjectId ?? null,
      activeProjectPath: () => "/workspace/codeline",
      fetch: async (input, init) => {
        const url = String(input)
        if (url === "/api/sessions" && init?.method === "POST") {
          options.bodies.push(JSON.parse(String(init.body)))
          return response({ created: true, session: { id: "created-session" } }, { status: 201 })
        }
        if (url === "/api/servers") return response(servers)
        if (url === "/api/servers/example-server/agents") return response(agents)
        if (url === "/api/servers/example-server/agents/example-agent-primary") return response(agentDetail)
        return response({ error: { code: "not_found", message: "missing" } }, { status: 404 })
      },
      ...(options.pendingExecutionSelection === undefined
        ? {}
        : { pendingExecutionSelection: options.pendingExecutionSelection }),
      ...(options.pendingAgentPrompt === undefined ? {} : { pendingAgentPrompt: options.pendingAgentPrompt }),
      ...(options.pendingInstructionOverrides === undefined
        ? {}
        : { pendingInstructionOverrides: options.pendingInstructionOverrides }),
      ...(options.pendingSkillSelection === undefined ? {} : { pendingSkillSelection: options.pendingSkillSelection }),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  return { dispose, state: state! }
}

test("the edited prompt and sparse instruction overrides are sent before the initial turn", async () => {
  const bodies: Array<Record<string, unknown>> = []
  const instructionPath = "/workspace/codeline/AGENTS.md"
  const created = stateCreate({
    bodies,
    pendingAgentPrompt: () => "Edited session prompt.",
    pendingInstructionOverrides: () => ({ [instructionPath]: "Edited AGENTS.md content." }),
  })
  await effectsSettle()

  await created.state.sessionCreateStart()

  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({
    agentPrompt: "Edited session prompt.",
    instructionOverrides: { [instructionPath]: "Edited AGENTS.md content." },
  })
  expect(v.safeParse(sessionCreateRequestSchema, bodies[0]).success).toBe(true)
  created.dispose()
})

test("the resolved resource selection is sent with the create request and matches its contract", async () => {
  const bodies: Array<Record<string, unknown>> = []
  const created = stateCreate({
    bodies,
    pendingExecutionSelection: () => executionSelection,
    pendingSkillSelection: () => skillSelection,
  })
  await effectsSettle()

  await created.state.sessionCreateStart("/workspace/other")

  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({
    executionSelection,
    primaryAgentId: "example-agent-primary",
    projectPath: "/workspace/other",
    serverId: "example-server",
    skillSelection,
  })
  expect(v.safeParse(sessionCreateRequestSchema, bodies[0]).success).toBe(true)
  created.dispose()
})

test("a registered project selection sends only its persisted project id", async () => {
  const bodies: Array<Record<string, unknown>> = []
  const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f70"
  const created = stateCreate({ activeProjectId: projectId, bodies })
  await effectsSettle()

  await created.state.sessionCreateStart()

  expect(bodies).toHaveLength(1)
  expect(bodies[0]).toMatchObject({ projectId })
  expect(bodies[0]).not.toHaveProperty("projectPath")
  expect(v.safeParse(sessionCreateRequestSchema, bodies[0]).success).toBe(true)
  created.dispose()
})

test("an unresolved resource selection omits the optional fields instead of sending nulls", async () => {
  const bodies: Array<Record<string, unknown>> = []
  const created = stateCreate({
    bodies,
    pendingExecutionSelection: () => undefined,
    pendingSkillSelection: () => undefined,
  })
  await effectsSettle()

  await created.state.sessionCreateStart()

  expect(bodies).toHaveLength(1)
  expect("executionSelection" in bodies[0]!).toBe(false)
  expect("skillSelection" in bodies[0]!).toBe(false)
  expect(v.safeParse(sessionCreateRequestSchema, bodies[0]).success).toBe(true)
  created.dispose()
})

test("a changed resource selection mints a new idempotency key instead of replaying the previous request", async () => {
  const bodies: Array<Record<string, unknown>> = []
  const [preset, presetSet] = createSignal("focused")
  const created = stateCreate({
    bodies,
    pendingExecutionSelection: () => executionSelection,
    pendingSkillSelection: () => ({ ...skillSelection, presetName: preset() }),
  })
  await effectsSettle()

  await created.state.sessionCreateStart()
  presetSet("default")
  await effectsSettle()
  await created.state.sessionCreateStart()

  expect(bodies).toHaveLength(2)
  expect(bodies[0]?.clientRequestId).not.toBe(bodies[1]?.clientRequestId)
  expect((bodies[1] as { skillSelection: { presetName: string } }).skillSelection.presetName).toBe("default")
  created.dispose()
})

test("a selection carrying more subagents than the contract allows is rejected before it is sent", () => {
  const oversized = {
    tools: {
      primary: { agentId: "example-agent-primary", tools: { bash: true, webfetch: false } },
      selectableSubagents: Array.from({ length: 101 }, (_, index) => ({
        agentId: `example-agent-subagent-${index}`,
        tools: { bash: false, webfetch: false },
      })),
    },
    version: 1 as const,
  }

  expect(
    v.safeParse(sessionCreateRequestSchema, {
      clientRequestId: "example-request",
      executionSelection: oversized,
      primaryAgentId: "example-agent-primary",
      serverId: "example-server",
      title: "Oversized selection",
    }).success,
  ).toBe(false)
})

test("retrying a failed create with an unchanged resource selection reuses the same idempotency key", async () => {
  const bodies: Array<Record<string, unknown>> = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: () => "example-account-retry",
      activeProjectPath: () => "/workspace/codeline",
      fetch: async (input, init) => {
        const url = String(input)
        if (url === "/api/sessions" && init?.method === "POST") {
          bodies.push(JSON.parse(String(init.body)))
          return response({ error: { code: "internal_server_error", message: "no" } }, { status: 500 })
        }
        if (url === "/api/servers") return response(servers)
        if (url === "/api/servers/example-server/agents") return response(agents)
        if (url === "/api/servers/example-server/agents/example-agent-primary") return response(agentDetail)
        return response({ error: { code: "not_found", message: "missing" } }, { status: 404 })
      },
      pendingExecutionSelection: () => executionSelection,
      pendingSkillSelection: () => skillSelection,
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  await state?.sessionCreateStart()
  await state?.sessionCreateStart()

  expect(bodies).toHaveLength(2)
  expect(bodies[0]?.clientRequestId).toBe(bodies[1]?.clientRequestId as string)
  expect(bodies[0]?.skillSelection).toEqual(bodies[1]?.skillSelection)
  dispose()
})
