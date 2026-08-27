import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { sessionResourceSelectorStateCreate } = await import("../src/ui/sessionResourceSelectorStateCreate.js")

const digest = (seed: string) => `sha256-${seed.repeat(64).slice(0, 64)}`
const projectId = "a".repeat(64)

/** Every typed representation carries the revision/ETag metadata the API clients require. */
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

const bundleCreate = (input: {
  bundlePath: string
  description: string
  name: string
  precedence: number
  source: "global" | "project"
}) => ({
  body: `${input.name} body`,
  bundleDigest: digest("b"),
  bundlePath: input.bundlePath,
  content: `---\nname: ${input.name}\n---\n${input.name} body`,
  description: input.description,
  digest: digest("c"),
  name: input.name,
  precedence: input.precedence,
  resources: [],
  size: 42,
  source: input.source,
})

const codeStyle = bundleCreate({
  bundlePath: ".agents/skills/code",
  description: "Refactor TypeScript.",
  name: "code-style",
  precedence: 1,
  source: "project",
})
const commits = bundleCreate({
  bundlePath: ".agents/skills/code/release",
  description: "Split changes into commits.",
  name: "commits",
  precedence: 1,
  source: "project",
})
const agentBrowser = bundleCreate({
  bundlePath: "global/skills/browser",
  description: "Drive a real browser.",
  name: "agent-browser",
  precedence: 0,
  source: "global",
})

const catalogResponse = {
  bundles: [agentBrowser, codeStyle, commits],
  collisions: [],
  diagnostics: [],
  digest: digest("d"),
  groups: [
    { path: ".agents/skills/code", precedence: 1, source: "project" as const },
    { path: ".agents/skills/code/release", precedence: 1, source: "project" as const },
    { path: "global/skills/browser", precedence: 0, source: "global" as const },
  ],
  projectId,
  roots: [
    { path: ".agents/skills", precedence: 1, source: "project" as const },
    { path: "global/skills", precedence: 0, source: "global" as const },
  ],
  skills: [agentBrowser, codeStyle, commits],
  version: 1 as const,
}

const presetsResponse = {
  diagnostics: [],
  digest: digest("e"),
  presets: [
    {
      description: "Everything",
      excludeSkills: [],
      includeFolders: ["."],
      includeSkills: [],
      name: "default",
      version: 1 as const,
    },
    {
      description: "Focused skills",
      excludeSkills: ["agent-browser"],
      includeFolders: [],
      includeSkills: ["code-style", "commits", "agent-browser"],
      name: "focused",
      version: 1 as const,
    },
  ],
  projectId,
  version: 1 as const,
}

const descriptionCatalogCreate = (
  entries: ReadonlyArray<{ bundlePath: string; description: string; name: string }>,
) => {
  const content =
    entries.length === 0
      ? ""
      : [
          "Available skills:",
          ...entries.flatMap(({ bundlePath, description, name }) => [
            `- ${name}: ${description}`,
            `  location: ${bundlePath}`,
          ]),
        ].join("\n")
  return {
    characterCount: content.length,
    content,
    estimatedTokens: Math.ceil(content.length / 4),
    estimatedTokensIsEstimate: true as const,
    skills: entries.map(({ bundlePath, description, name }) => ({ bundlePath, description, name })),
    version: 1 as const,
  }
}

const selectionResponseCreate = (presetName: "default" | "focused") => {
  const activeSkills = presetName === "focused" ? [codeStyle, commits] : [agentBrowser, codeStyle, commits]
  return {
    catalogDigest: digest("d"),
    descriptionCatalog: descriptionCatalogCreate(activeSkills),
    preset: presetsResponse.presets.find(({ name }) => name === presetName)!,
    presetCatalogDigest: digest("e"),
    projectId,
    selection: {
      activeSkills,
      excludedSkillNames: presetName === "focused" ? ["agent-browser"] : [],
      missingFolderPaths: [],
      missingSkillNames: [],
      presetName,
      userOverride: { disabledSkills: [], enabledSkills: [] },
      version: 1 as const,
    },
    version: 1 as const,
  }
}

const instructionsResponse = {
  diagnostics: [],
  projectId,
  snapshots: [
    {
      digest: digest("f"),
      path: "global/AGENTS.md",
      precedence: 0,
      scope: "global",
      size: 12,
      source: "global" as const,
      validation: "valid" as const,
    },
    {
      digest: digest("1"),
      path: "AGENTS.md",
      precedence: 1,
      scope: ".",
      size: 24,
      source: "project" as const,
      validation: "valid" as const,
    },
  ],
  version: 1 as const,
}

const agentsResponse = representation({
  agents: [
    {
      id: "example-agent-primary",
      name: "Primary Agent",
      parentAgentId: null,
      role: "primary",
      serverId: "example-server",
    },
    {
      id: "example-agent-explore",
      name: "Explore",
      parentAgentId: "example-agent-primary",
      role: "subagent",
      serverId: "example-server",
    },
    {
      id: "example-agent-other-primary",
      name: "Other Primary Agent",
      parentAgentId: null,
      role: "primary",
      serverId: "example-server",
    },
  ],
})

const agentDetailCreate = (id: string, name: string, role: string, tools: { bash: boolean; webfetch: boolean }) =>
  representation({
    agent: {
      configuration: {
        apiKey: "$CODEX_LB_API_TOKEN",
        baseUrl: "https://codex.example.com/v1",
        model: "codex-model",
        provider: "codex-lb",
        tools,
      },
      id,
      name,
      role,
      serverId: "example-server",
    },
  })

const capturedExecutionResources = {
  descriptionCatalog: {
    characterCount: 60,
    estimatedTokens: 15,
    estimatedTokensIsEstimate: true as const,
    skills: [{ bundlePath: ".agents/skills/code", description: "Refactor TypeScript.", name: "code-style" }],
    version: 1 as const,
  },
  instructionSources: [
    {
      digest: digest("f"),
      path: "global/AGENTS.md",
      precedence: 0,
      scope: "global",
      size: 12,
      source: "global" as const,
      validation: "valid" as const,
    },
  ],
  presetName: "focused",
  skills: [
    {
      bundleDigest: digest("b"),
      bundlePath: ".agents/skills/code",
      description: "Refactor TypeScript.",
      digest: digest("c"),
      name: "code-style",
      precedence: 1,
      resources: [],
      size: 42,
      source: "project" as const,
    },
  ],
  tools: {
    primary: { agentId: "example-agent-primary", tools: ["bash"] },
    selectableSubagents: [{ agentId: "example-agent-explore", tools: ["webfetch"] }],
  },
  version: 1 as const,
}

const sessionDetailCreate = (executionResources: unknown) =>
  representation({
    agent: { id: "example-agent-primary" },
    server: { id: "example-server" },
    session: {
      archivedAt: null,
      createdAt: "2026-08-26T10:00:00.000Z",
      executionResources,
      executionSelection: {
        tools: {
          primary: { agentId: "example-agent-primary", tools: { bash: true, webfetch: false } },
          selectableSubagents: [{ agentId: "example-agent-explore", tools: { bash: false, webfetch: true } }],
        },
        version: 1,
      },
      id: "example-session",
      metadata: {},
      parentSessionId: null,
      pinned: false,
      primaryAgentId: "example-agent-primary",
      projectPath: "/workspace/codeline",
      revision: 1,
      serverId: "example-server",
      title: "Example session",
      updatedAt: "2026-08-26T10:00:00.000Z",
    },
  })

type FetchOverrides = Record<string, () => Response>

function fetchCreate(requests: string[], overrides: FetchOverrides = {}) {
  return async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input)
    requests.push(url)
    for (const [prefix, override] of Object.entries(overrides)) {
      if (url.startsWith(prefix)) return override()
    }
    if (url.startsWith("/api/project/identity")) return response({ id: projectId, label: "codeline" })
    if (url.startsWith("/api/project/skills/catalog")) return response(catalogResponse)
    if (url.startsWith("/api/project/skills/presets")) return response(presetsResponse)
    if (url.startsWith("/api/project/skills/selection")) {
      return response(selectionResponseCreate(url.includes("preset=focused") ? "focused" : "default"))
    }
    if (url.startsWith("/api/agent-instructions")) return response(instructionsResponse)
    if (url === "/api/servers/example-server/agents") return response(agentsResponse)
    if (url === "/api/servers/example-server/agents/example-agent-primary") {
      return response(
        agentDetailCreate("example-agent-primary", "Primary Agent", "primary", { bash: true, webfetch: false }),
      )
    }
    if (url === "/api/servers/example-server/agents/example-agent-explore") {
      return response(
        agentDetailCreate("example-agent-explore", "Explore", "subagent", { bash: false, webfetch: false }),
      )
    }
    if (url === "/api/servers/example-server/agents/example-agent-other-primary") {
      return response(
        agentDetailCreate("example-agent-other-primary", "Other Primary Agent", "primary", {
          bash: true,
          webfetch: true,
        }),
      )
    }
    if (url.startsWith("/api/sessions/")) return response(sessionDetailCreate(capturedExecutionResources))
    return response({ error: { code: "not_found", message: "missing" } }, { status: 404 })
  }
}

function stateCreate(options: {
  overrides?: FetchOverrides
  projectPath?: string | null
  requests?: string[]
  serverId?: string | null
  sessionId?: string | null
}) {
  const [selectedSessionId, selectedSessionIdSet] = createSignal(options.sessionId ?? null)
  const [selectedServerId, selectedServerIdSet] = createSignal(
    options.serverId === undefined ? "example-server" : options.serverId,
  )
  const [projectPath, projectPathSet] = createSignal(
    options.projectPath === undefined ? "/workspace/codeline" : options.projectPath,
  )
  let state: ReturnType<typeof sessionResourceSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionResourceSelectorStateCreate({
      fetch: fetchCreate(options.requests ?? [], options.overrides ?? {}),
      projectPath,
      selectedAgentId: () => "example-agent-primary",
      selectedServerId,
      selectedSessionId,
    })
    return rootDispose
  })
  return { dispose, projectPathSet, selectedServerIdSet, selectedSessionIdSet, state: state! }
}

test("the pre-session workspace resolves the project id and loads the effective selection", async () => {
  const requests: string[] = []
  const created = stateCreate({ requests })
  await effectsSettle()

  expect(created.state.status()).toBe("ready")
  expect(created.state.isMutable()).toBe(true)
  expect(requests.some((url) => url.startsWith("/api/project/identity?path="))).toBe(true)
  expect(requests.some((url) => url.includes(`/api/project/skills/catalog?project=${projectId}`))).toBe(true)
  expect(created.state.presetName()).toBe("default")
  expect(created.state.presetSource()).toBe("default")
  expect(created.state.activeSkills().map(({ name }) => name)).toEqual(["agent-browser", "code-style", "commits"])
  expect(created.state.instructionSnapshots().map(({ path }) => path)).toEqual(["global/AGENTS.md", "AGENTS.md"])
  created.dispose()
})

test("selecting a preset overrides the saved default and applies its exclusions", async () => {
  const created = stateCreate({})
  await effectsSettle()

  created.state.presetSelect("unknown-preset")
  expect(created.state.presetName()).toBe("default")

  created.state.presetSelect("focused")
  await effectsSettle()

  expect(created.state.presetName()).toBe("focused")
  expect(created.state.presetSource()).toBe("override")
  expect(created.state.activeSkills().map(({ name }) => name)).toEqual(["code-style", "commits"])
  expect(created.state.pendingSkillSelection()).toEqual({
    override: { disabledSkills: [], enabledSkills: [] },
    presetName: "focused",
  })
  created.dispose()
})

test("a folder toggle recurses into descendant skills and updates the pending override", async () => {
  const created = stateCreate({})
  await effectsSettle()

  created.state.folderToggle(".agents/skills/code", false)
  expect(created.state.activeSkills().map(({ name }) => name)).toEqual(["agent-browser"])
  expect(created.state.pendingSkillSelection()?.override.disabledSkills).toEqual(["code-style", "commits"])

  created.state.folderToggle(".agents/skills/code", true)
  expect(created.state.activeSkills().map(({ name }) => name)).toEqual(["agent-browser", "code-style", "commits"])
  expect(created.state.pendingSkillSelection()?.override.disabledSkills).toEqual([])
  created.dispose()
})

test("an individual skill override layers over the recursive folder selection", async () => {
  const created = stateCreate({})
  await effectsSettle()

  created.state.skillToggle("commits", false)

  expect(created.state.activeSkills().map(({ name }) => name)).toEqual(["agent-browser", "code-style"])
  expect(created.state.folders().find(({ path }) => path === ".agents/skills/code")?.selection).toBe("partial")
  expect(created.state.pendingSkillSelection()).toEqual({
    override: { disabledSkills: ["commits"], enabledSkills: [] },
    presetName: "default",
  })
  created.dispose()
})

test("changing the preset scope discards pending per-skill overrides", async () => {
  const created = stateCreate({})
  await effectsSettle()

  created.state.skillToggle("commits", false)
  expect(created.state.pendingSkillSelection()?.override.disabledSkills).toEqual(["commits"])

  created.state.presetSelect("focused")
  await effectsSettle()

  expect(created.state.pendingSkillSelection()?.override).toEqual({ disabledSkills: [], enabledSkills: [] })
  created.dispose()
})

test("agent tool rows are seeded from agent defaults and toggled into the pending execution selection", async () => {
  const created = stateCreate({})
  await effectsSettle()

  expect(created.state.agentTools()).toEqual([
    {
      agentId: "example-agent-primary",
      bash: true,
      isPrimary: true,
      name: "Primary Agent",
      role: "primary",
      webfetch: false,
    },
    {
      agentId: "example-agent-explore",
      bash: false,
      isPrimary: false,
      name: "Explore",
      role: "subagent",
      webfetch: false,
    },
  ])

  created.state.toolToggle("example-agent-primary", "webfetch", true)
  created.state.toolToggle("example-agent-explore", "bash", true)

  expect(created.state.pendingExecutionSelection()).toEqual({
    tools: {
      primary: { agentId: "example-agent-primary", tools: { bash: true, webfetch: true } },
      selectableSubagents: [{ agentId: "example-agent-explore", tools: { bash: true, webfetch: false } }],
    },
    version: 1,
  })
  created.dispose()
})

test("other primary agents on the server are never offered or submitted as selectable subagents", async () => {
  const created = stateCreate({})
  await effectsSettle()

  expect(created.state.agentTools().map(({ agentId }) => agentId)).toEqual([
    "example-agent-primary",
    "example-agent-explore",
  ])
  expect(created.state.pendingExecutionSelection()?.tools.selectableSubagents).toEqual([
    { agentId: "example-agent-explore", tools: { bash: false, webfetch: false } },
  ])
  created.dispose()
})

test("an existing session renders its immutable captured resources without live discovery", async () => {
  const requests: string[] = []
  const created = stateCreate({ requests, sessionId: "example-session" })
  await effectsSettle()

  expect(created.state.status()).toBe("ready")
  expect(created.state.isMutable()).toBe(false)
  expect(requests.some((url) => url.startsWith("/api/project/skills"))).toBe(false)
  expect(requests.some((url) => url.startsWith("/api/agent-instructions"))).toBe(false)
  expect(created.state.presetName()).toBe("focused")
  expect(created.state.activeSkills()).toEqual([
    {
      bundlePath: ".agents/skills/code",
      description: "Refactor TypeScript.",
      name: "code-style",
      source: "project",
    },
  ])
  expect(created.state.agentTools()).toEqual([
    {
      agentId: "example-agent-primary",
      bash: true,
      isPrimary: true,
      name: "example-agent-primary",
      role: "primary",
      webfetch: false,
    },
    {
      agentId: "example-agent-explore",
      bash: false,
      isPrimary: false,
      name: "example-agent-explore",
      role: "subagent",
      webfetch: true,
    },
  ])
  expect(created.state.instructionSnapshots().map(({ path }) => path)).toEqual(["global/AGENTS.md"])
  expect(created.state.descriptionCatalog().estimatedTokens).toBe(15)
  expect(created.state.existingExecutionSelection()?.tools.primary.tools).toEqual({ bash: true, webfetch: false })
  created.dispose()
})

test("mutations on an existing session never change its captured resource display", async () => {
  const created = stateCreate({ sessionId: "example-session" })
  await effectsSettle()

  created.state.presetSelect("default")
  created.state.skillToggle("code-style", false)
  created.state.folderToggle(".agents/skills/code", false)
  created.state.toolToggle("example-agent-primary", "bash", false)
  await effectsSettle()

  expect(created.state.presetName()).toBe("focused")
  expect(created.state.activeSkills().map(({ name }) => name)).toEqual(["code-style"])
  expect(created.state.agentTools()[0]?.bash).toBe(true)
  expect(created.state.isMutable()).toBe(false)
  created.dispose()
})

test("a session created before manifest capture reports no captured resources", async () => {
  const created = stateCreate({
    overrides: { "/api/sessions/": () => response(sessionDetailCreate(null)) },
    sessionId: "example-session",
  })
  await effectsSettle()

  expect(created.state.status()).toBe("ready")
  expect(created.state.existingExecutionResources()).toBeNull()
  expect(created.state.activeSkills()).toEqual([])
  expect(created.state.agentTools()).toEqual([])
  expect(created.state.presetName()).toBeNull()
  created.dispose()
})

test("a failed inspection read reports an error and retry reloads the queries", async () => {
  const requests: string[] = []
  let failing = true
  const created = stateCreate({
    overrides: {
      "/api/project/skills/catalog": () =>
        failing
          ? response({ error: { code: "internal_server_error", message: "no" } }, { status: 500 })
          : response(catalogResponse),
    },
    requests,
  })
  await effectsSettle()

  expect(created.state.status()).toBe("error")
  expect(created.state.errorMessage()).toBe("no")

  failing = false
  created.state.retry()
  await effectsSettle()

  expect(created.state.status()).toBe("ready")
  expect(created.state.errorMessage()).toBeNull()
  created.dispose()
})

test("without a project reference the workspace stays idle instead of loading forever", async () => {
  const requests: string[] = []
  const created = stateCreate({ projectPath: null, requests })
  await effectsSettle()

  expect(created.state.status()).toBe("idle")
  expect(created.state.errorMessage()).toBeNull()
  expect(requests.some((url) => url.startsWith("/api/project"))).toBe(false)
  expect(requests.some((url) => url.startsWith("/api/agent-instructions"))).toBe(false)
  created.dispose()
})

test("a project selected after the initial idle render loads the effective selection", async () => {
  const created = stateCreate({ projectPath: null })
  await effectsSettle()
  expect(created.state.status()).toBe("idle")

  created.projectPathSet("/workspace/codeline")
  await effectsSettle()

  expect(created.state.status()).toBe("ready")
  expect(created.state.presetName()).toBe("default")
  created.dispose()
})

test("a server selected after the project keeps the workspace ready without a stuck loading state", async () => {
  const created = stateCreate({ serverId: null })
  await effectsSettle()

  expect(created.state.status()).toBe("ready")
  expect(created.state.agentTools()).toEqual([])

  created.selectedServerIdSet("example-server")
  await effectsSettle()

  expect(created.state.status()).toBe("ready")
  expect(created.state.agentTools().map(({ agentId }) => agentId)).toEqual([
    "example-agent-primary",
    "example-agent-explore",
  ])
  created.dispose()
})

test("an existing session read is idle rather than loading while no session is selected", async () => {
  const created = stateCreate({ projectPath: null })
  await effectsSettle()

  created.selectedSessionIdSet("example-session")
  await effectsSettle()

  expect(created.state.status()).toBe("ready")
  expect(created.state.isMutable()).toBe(false)
  created.dispose()
})

test("no pending execution selection is submitted before the agent tool defaults are known", async () => {
  const created = stateCreate({
    overrides: {
      "/api/servers/example-server/agents": () =>
        response({ error: { code: "internal_server_error", message: "no" } }, { status: 500 }),
    },
  })
  await effectsSettle()

  expect(created.state.pendingExecutionSelection()).toBeUndefined()
  created.dispose()
})
