import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { sessionTargetSelectorStateCreate } = await import("../src/ui/sessionTargetSelectorStateCreate.js")

/** Every representation is returned with the revision/ETag metadata the typed clients require. */
const representation = <T extends object>(body: T, revision = 1) => ({
  ...body,
  etag: `"${revision}"`,
  revision,
  schemaVersion: "v2",
})

const response = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init)

let accountSequence = 0
/** Each test uses its own account so the shared revision/ETag cache never leaks between cases. */
const accountIdCreate = () => {
  accountSequence += 1
  return () => `example-account-${accountSequence}`
}

/** The typed session shell read returns the complete `GET /api/sessions/:sessionId` representation. */
const sessionDetail = (sessionId: string, target: { primaryAgentId: string; serverId: string }, revision = 1) =>
  representation(
    {
      agent: { id: target.primaryAgentId },
      server: { id: target.serverId },
      session: {
        archivedAt: null,
        createdAt: "2026-08-22T10:00:00.000Z",
        id: sessionId,
        metadata: {},
        parentSessionId: null,
        pinned: false,
        primaryAgentId: target.primaryAgentId,
        projectPath: "~",
        revision,
        serverId: target.serverId,
        title: "Example session",
        updatedAt: "2026-08-22T10:00:00.000Z",
      },
    },
    revision,
  )

const servers = representation({
  servers: [
    { id: "example-server-local", name: "Example Local Server" },
    { id: "example-server-remote", name: "Example Remote Server" },
  ],
})
const agentsByServer: Record<string, unknown> = {
  "example-server-local": representation({
    agents: [
      {
        id: "example-agent-local",
        name: "Example Coding Agent",
        parentAgentId: null,
        role: "primary",
        serverId: "example-server-local",
      },
      {
        id: "example-agent-local-review",
        name: "Example Review Agent",
        parentAgentId: null,
        role: "primary",
        serverId: "example-server-local",
      },
      {
        id: "example-agent-local-subagent",
        name: "Example Subagent",
        parentAgentId: "example-agent-local",
        role: "subagent",
        serverId: "example-server-local",
      },
    ],
  }),
  "example-server-remote": representation({
    agents: [
      {
        id: "example-agent-remote",
        name: "Example Remote Agent",
        parentAgentId: null,
        role: "primary",
        serverId: "example-server-remote",
      },
    ],
  }),
}
const agentDetails: Record<string, unknown> = {
  "example-agent-local": representation({
    agent: {
      configuration: {
        apiKey: "$CODEX_LB_API_TOKEN",
        baseUrl: "https://codex.example.com/v1",
        model: "codex-model",
        provider: "codex-lb",
      },
      id: "example-agent-local",
      name: "Example Coding Agent",
      role: "primary",
      serverId: "example-server-local",
    },
  }),
  "example-agent-local-review": representation({
    agent: {
      configuration: {
        apiKey: "$CLIPROXYAPI_API_KEY",
        baseUrl: "https://cli.example.com/v1",
        model: "review-model",
        provider: "cliproxyapi",
      },
      id: "example-agent-local-review",
      name: "Example Review Agent",
      role: "primary",
      serverId: "example-server-local",
    },
  }),
  "example-agent-remote": representation({
    agent: {
      configuration: {
        apiKey: "$CODEX_LB_API_TOKEN",
        baseUrl: "https://remote.example.com/v1",
        model: "remote-model",
        provider: "codex-lb",
      },
      id: "example-agent-remote",
      name: "Example Remote Agent",
      role: "primary",
      serverId: "example-server-remote",
    },
  }),
}

async function effectsSettle() {
  for (let index = 0; index < 12; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

function fetchDefaultCreate(requests: string[], overrides: Record<string, () => Response> = {}) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push(`${init?.method ?? "GET"} ${url}`)
    const override = overrides[url]
    if (override !== undefined) return override()
    if (url === "/api/servers") return response(servers)
    const agentMatch = /^\/api\/servers\/([^/]+)\/agents$/.exec(url)
    if (agentMatch?.[1] !== undefined) {
      return response(agentsByServer[decodeURIComponent(agentMatch[1])] ?? representation({ agents: [] }))
    }
    const agentDetailMatch = /^\/api\/servers\/[^/]+\/agents\/([^/]+)$/.exec(url)
    if (agentDetailMatch?.[1] !== undefined) {
      return response(agentDetails[decodeURIComponent(agentDetailMatch[1])] ?? {}, {
        status: agentDetails[decodeURIComponent(agentDetailMatch[1])] === undefined ? 404 : 200,
      })
    }
    const sessionMatch = /^\/api\/sessions\/([^/]+)$/.exec(url)
    if (sessionMatch?.[1] !== undefined) {
      return response(
        sessionDetail(decodeURIComponent(sessionMatch[1]), {
          primaryAgentId: "example-agent-remote",
          serverId: "example-server-remote",
        }),
      )
    }
    return response({ created: true, session: { id: "created-session" } }, { status: 201 })
  }
}

test("state loads agents from the deterministic default server", async () => {
  const requests: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate(requests),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.serverStatus()).toBe("ready")
  expect(state?.agentStatus()).toBe("ready")
  expect(state?.servers()).toHaveLength(2)
  expect(state?.agents()).toHaveLength(2)
  expect(state?.agents().map((agent) => agent.id)).not.toContain("example-agent-local-subagent")
  expect(state?.selectedServerId()).toBe("example-server-local")
  expect(state?.selectedAgentId()).toBe("example-agent-local")
  expect(state?.pendingTarget()).toEqual({ agentId: "example-agent-local", serverId: "example-server-local" })
  expect(state?.configurationReadiness()).toMatchObject({
    agents: [
      { id: "example-agent-local", name: "Example Coding Agent" },
      { id: "example-agent-local-review", name: "Example Review Agent" },
    ],
    selectedAgentId: "example-agent-local",
    status: "ready",
  })
  expect(requests).toContain("GET /api/servers")
  expect(requests).toContain("GET /api/servers/example-server-local/agents")
  dispose()
})

test("state restores and persists the last used agent", async () => {
  const values = new Map([
    ["codeline.session-target-selection", JSON.stringify({ "example-server-local": "example-agent-local-review" })],
  ])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate([]),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
      storage,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.selectedAgentId()).toBe("example-agent-local-review")
  state?.agentSelect("example-agent-local")
  expect(JSON.parse(values.get("codeline.session-target-selection") ?? "null")).toEqual({
    "example-server-local": "example-agent-local",
  })
  dispose()
})

test("hidden server selection remains available for session creation", async () => {
  const requests: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate(requests),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  state?.serverSelect("example-server-remote")
  await effectsSettle()
  await state?.sessionCreateStart()

  expect(state?.pendingTarget()).toEqual({ agentId: "example-agent-remote", serverId: "example-server-remote" })
  expect(requests).toContain("POST /api/sessions")
  dispose()
})

test("workspace target controls hide server selection while retaining agent selection", async () => {
  const source = await Bun.file(new URL("../src/ui/SessionTargetSelector.tsx", import.meta.url)).text()

  expect(source).toContain('aria-label="Agent for a new session"')
  expect(source).not.toContain("serverSelect")
  expect(source).not.toContain("selectedServerId")
})

test("selecting another server reloads its agents without creating a session", async () => {
  const requests: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate(requests),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  state?.serverSelect("example-server-remote")
  await effectsSettle()

  expect(state?.selectedServerId()).toBe("example-server-remote")
  expect(state?.selectedAgentId()).toBe("example-agent-remote")
  expect(requests.filter((request) => request.startsWith("POST"))).toEqual([])
  dispose()
})

test("an unknown server or agent selection is rejected", async () => {
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate([]),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  state?.serverSelect("unknown-server")
  state?.agentSelect("unknown-agent")
  expect(state?.selectedServerId()).toBe("example-server-local")
  expect(state?.selectedAgentId()).toBe("example-agent-local")
  dispose()
})

test("creating a session posts the selected target once and navigates", async () => {
  const requests: string[] = []
  const bodies: string[] = []
  const selected: string[] = []
  const navigation: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      clientRequestIdCreate: () => "deterministic-request",
      fetch: async (input, init) => {
        if (init?.method === "POST") bodies.push(String(init.body))
        return fetchDefaultCreate(requests)(input, init)
      },
      selectedSessionId: () => null,
      sessionNew: () => navigation.push("new"),
      sessionSelect: (sessionId) => {
        navigation.push("select")
        selected.push(sessionId)
      },
    })
    return rootDispose
  })
  await effectsSettle()

  state?.agentSelect("example-agent-local-review")
  const first = state?.sessionCreateStart()
  const duplicate = state?.sessionCreateStart()
  await Promise.all([first, duplicate])
  await effectsSettle()

  expect(requests.filter((request) => request === "POST /api/sessions")).toHaveLength(1)
  expect(JSON.parse(bodies[0] ?? "{}")).toEqual({
    clientRequestId: "deterministic-request",
    primaryAgentId: "example-agent-local-review",
    projectPath: "~",
    serverId: "example-server-local",
    title: "New session",
  })
  expect(selected).toEqual(["created-session"])
  expect(navigation).toEqual(["new", "select"])
  expect(state?.sessionCreateStatus()).toBe("idle")
  dispose()
})

test("the new-session route automatically creates and selects a blank session", async () => {
  const requests: string[] = []
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate(requests),
      isNewSessionRoute: () => true,
      selectedSessionId,
      sessionSelect: setSelectedSessionId,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(requests.filter((request) => request === "POST /api/sessions")).toHaveLength(1)
  expect(selectedSessionId()).toBe("created-session")
  expect(state?.sessionCreateStatus()).toBe("idle")
  dispose()
})

test("automatic creation and first-message fallback share one in-flight request", async () => {
  const requests: string[] = []
  const gate = deferredCreate<void>()
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        requests.push(`${init?.method ?? "GET"} ${String(input)}`)
        if (String(input) === "/api/sessions" && init?.method === "POST") {
          await gate.promise
          return response({ created: true, session: { id: "created-session" } }, { status: 201 })
        }
        return fetchDefaultCreate([])(input, init)
      },
      isNewSessionRoute: () => true,
      selectedSessionId,
      sessionSelect: setSelectedSessionId,
    })
    return rootDispose
  })
  await effectsSettle()

  const fallback = state?.sessionCreateStart()
  expect(requests.filter((request) => request === "POST /api/sessions")).toHaveLength(1)
  gate.resolve()
  await fallback
  await effectsSettle()

  expect(selectedSessionId()).toBe("created-session")
  expect(requests.filter((request) => request === "POST /api/sessions")).toHaveLength(1)
  dispose()
})

test("automatic creation does not re-trigger before the final selection", async () => {
  const requests: string[] = []
  const selectionStatuses: string[] = []
  const [isNewSessionRoute, setIsNewSessionRoute] = createSignal(true)
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate(requests),
      isNewSessionRoute,
      selectedSessionId,
      sessionSelect: (sessionId) => {
        selectionStatuses.push(state?.sessionCreateStatus() ?? "missing")
        setSelectedSessionId(sessionId)
        setIsNewSessionRoute(false)
      },
    })
    return rootDispose
  })
  await effectsSettle()

  expect(requests.filter((request) => request === "POST /api/sessions")).toHaveLength(1)
  expect(selectionStatuses).toEqual(["creating"])
  expect(selectedSessionId()).toBe("created-session")
  await effectsSettle()
  expect(requests.filter((request) => request === "POST /api/sessions")).toHaveLength(1)
  dispose()
})

test("a send-triggered new-session route does not create a second session", async () => {
  const requests: string[] = []
  const navigation: string[] = []
  const selected: string[] = []
  const [isNewSessionRoute, setIsNewSessionRoute] = createSignal(false)
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  let routeCreation: Promise<string | null> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate(requests),
      isNewSessionRoute,
      selectedSessionId,
      sessionNew: () => {
        navigation.push("new")
        setIsNewSessionRoute(true)
        routeCreation = state?.sessionCreateStart()
      },
      sessionSelect: (sessionId) => {
        navigation.push("select")
        selected.push(sessionId)
        setSelectedSessionId(sessionId)
      },
    })
    return rootDispose
  })
  await effectsSettle()

  const sendCreation = state?.sessionCreateStart()
  await sendCreation
  await effectsSettle()

  expect(routeCreation).toBeDefined()
  expect(routeCreation).toBe(sendCreation)
  expect(requests.filter((request) => request === "POST /api/sessions")).toHaveLength(1)
  expect(navigation).toEqual(["new", "select"])
  expect(selected).toEqual(["created-session"])
  expect(selectedSessionId()).toBe("created-session")
  dispose()
})

test("a failed new-session navigation cancels deferred creation", async () => {
  const requests: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate(requests),
      selectedSessionId: () => null,
      sessionNew: () => {
        throw new Error("navigation failed")
      },
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(() => state?.sessionCreateStart()).toThrow("navigation failed")
  await effectsSettle()

  expect(requests.filter((request) => request === "POST /api/sessions")).toHaveLength(0)
  expect(state?.sessionCreateStatus()).toBe("idle")
  dispose()
})

test("a stale automatic result cannot select a session after the target changes", async () => {
  const gates: Array<ReturnType<typeof deferredCreate<void>>> = []
  const selected: string[] = []
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        if (String(input) === "/api/sessions" && init?.method === "POST") {
          const gate = deferredCreate<void>()
          gates.push(gate)
          await gate.promise
          const body = JSON.parse(String(init.body)) as { primaryAgentId: string }
          return response({ created: true, session: { id: `created-${body.primaryAgentId}` } }, { status: 201 })
        }
        return fetchDefaultCreate([])(input, init)
      },
      isNewSessionRoute: () => true,
      selectedSessionId,
      sessionSelect: (sessionId) => {
        selected.push(sessionId)
        setSelectedSessionId(sessionId)
      },
    })
    return rootDispose
  })
  await effectsSettle()
  expect(gates).toHaveLength(1)

  state?.agentSelect("example-agent-local-review")
  await effectsSettle()
  expect(gates).toHaveLength(2)

  gates[0]?.resolve()
  await effectsSettle()
  expect(selected).toEqual([])
  expect(selectedSessionId()).toBeNull()

  gates[1]?.resolve()
  await effectsSettle()
  expect(selected).toEqual(["created-example-agent-local-review"])
  expect(selectedSessionId()).toBe("created-example-agent-local-review")
  dispose()
})

test("an overlapping create with a different project only selects the newest session", async () => {
  const gates: Array<ReturnType<typeof deferredCreate<void>>> = []
  const selected: string[] = []
  const [selectedSessionId, setSelectedSessionId] = createSignal<string | null>(null)
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        if (String(input) === "/api/sessions" && init?.method === "POST") {
          const gate = deferredCreate<void>()
          gates.push(gate)
          await gate.promise
          const body = JSON.parse(String(init.body)) as { projectPath: string }
          return response({ created: true, session: { id: `created-${body.projectPath}` } }, { status: 201 })
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId,
      sessionSelect: (sessionId) => {
        selected.push(sessionId)
        setSelectedSessionId(sessionId)
      },
    })
    return rootDispose
  })
  await effectsSettle()

  const first = state?.sessionCreateStart("/workspace/first")
  const second = state?.sessionCreateStart("/workspace/second")
  await effectsSettle()
  expect(gates).toHaveLength(2)

  gates[1]?.resolve()
  expect(await second).toBe("created-/workspace/second")
  expect(selected).toEqual(["created-/workspace/second"])

  gates[0]?.resolve()
  expect(await first).toBeNull()
  expect(selected).toEqual(["created-/workspace/second"])
  dispose()
})

test("session creation requires and sends the active project", async () => {
  const bodies: unknown[] = []
  let projectPath: string | null = null
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      activeProjectPath: () => projectPath,
      fetch: async (input, init) => {
        if (String(input) === "/api/sessions" && init?.method === "POST") bodies.push(JSON.parse(String(init.body)))
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.canCreateSession()).toBe(false)
  await state?.sessionCreateStart()
  expect(state?.sessionCreateErrorMessage()).toBe("Select a project before creating a conversation.")
  expect(bodies).toEqual([])

  projectPath = "/workspace/codeline"
  expect(state?.canCreateSession()).toBe(true)
  await state?.sessionCreateStart()
  expect(bodies).toEqual([expect.objectContaining({ projectPath: "/workspace/codeline" })])
  dispose()
})

test("a failed create reports an error without navigating", async () => {
  const selected: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate([], {
        "/api/sessions": () => response({ error: { code: "not_found", message: "missing" } }, { status: 404 }),
      }),
      selectedSessionId: () => null,
      sessionSelect: (sessionId) => selected.push(sessionId),
    })
    return rootDispose
  })
  await effectsSettle()

  await state?.sessionCreateStart()
  expect(state?.sessionCreateStatus()).toBe("error")
  expect(selected).toEqual([])
  dispose()
})

test("server errors surface a retry that reloads the list", async () => {
  const requests: string[] = []
  let failing = true
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        const url = String(input)
        requests.push(url)
        if (url === "/api/servers" && failing) {
          return response({ error: { code: "internal_server_error", message: "no" } }, { status: 500 })
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()
  expect(state?.serverStatus()).toBe("error")
  expect(state?.canCreateSession()).toBe(false)
  expect(state?.configurationReadiness().status).toBe("server-error")

  failing = false
  state?.configurationReadiness().retry()
  await effectsSettle()

  expect(state?.serverStatus()).toBe("ready")
  expect(state?.selectedServerId()).toBe("example-server-local")
  expect(state?.configurationReadiness().status).toBe("ready")
  expect(requests.filter((url) => url === "/api/servers")).toHaveLength(2)
  dispose()
})

test("agent errors surface a readiness retry that restores the executable target", async () => {
  const requests: string[] = []
  let failing = true
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        const url = String(input)
        requests.push(url)
        const agentMatch = /^\/api\/servers\/([^/]+)\/agents$/.exec(url)
        if (agentMatch?.[1] === "example-server-local" && failing) {
          return response({ error: { code: "internal_server_error", message: "no" } }, { status: 500 })
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.agentStatus()).toBe("error")
  expect(state?.canCreateSession()).toBe(false)
  expect(state?.configurationReadiness().status).toBe("agent-error")

  failing = false
  state?.configurationReadiness().retry()
  await effectsSettle()

  expect(state?.agentStatus()).toBe("ready")
  expect(state?.configurationReadiness().status).toBe("ready")
  expect(state?.canCreateSession()).toBe(true)
  expect(requests.filter((url) => url === "/api/servers/example-server-local/agents")).toHaveLength(2)
  dispose()
})

test("the readiness contract owns agent choice and rejects unknown agents", async () => {
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate([]),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  const configuration = state?.configurationReadiness()
  configuration?.agentSelect("example-agent-local-review")
  await effectsSettle()

  expect(state?.configurationReadiness()).toMatchObject({
    selectedAgentId: "example-agent-local-review",
    status: "ready",
  })
  expect(state?.pendingTarget()).toEqual({ agentId: "example-agent-local-review", serverId: "example-server-local" })

  configuration?.agentSelect("unknown-agent")
  expect(state?.configurationReadiness().selectedAgentId).toBe("example-agent-local-review")
  dispose()
})

test("an empty server list keeps the selector empty and blocks creation", async () => {
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate([], { "/api/servers": () => response(representation({ servers: [] })) }),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.serverStatus()).toBe("empty")
  expect(state?.agentStatus()).toBe("empty")
  expect(state?.pendingTarget()).toBeNull()
  expect(state?.canCreateSession()).toBe(false)
  expect(state?.configurationReadiness()).toMatchObject({ agents: [], selectedAgentId: null, status: "no-server" })
  dispose()
})

test("an invalid response body is rejected as an error", async () => {
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate([], { "/api/servers": () => response({ servers: [{ id: "" }] }) }),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.serverStatus()).toBe("error")
  dispose()
})

test("workspace configuration loads an editable agent and uses persisted-agent provider APIs", async () => {
  const requests: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        const url = String(input)
        requests.push(`${init?.method ?? "GET"} ${url}`)
        if (url.endsWith("/models")) {
          return response({ models: [{ id: "codex-model" }, { id: "codex-next", name: "Codex Next" }] })
        }
        if (url.endsWith("/connection-test")) {
          return response({
            discoveredModelCount: 2,
            model: "codex-model",
            modelAvailable: true,
            ok: true,
            provider: "codex-lb",
          })
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.configurationReadiness().draft).toMatchObject({
    baseUrl: "https://codex.example.com/v1",
    model: "codex-model",
    name: "Example Coding Agent",
    provider: "codex-lb",
    secretReference: "$CODEX_LB_API_TOKEN",
  })

  await state?.configurationReadiness().modelsDiscover()
  await state?.configurationReadiness().connectionTestStart()

  expect(requests).toContain("POST /api/servers/example-server-local/agents/example-agent-local/models")
  expect(requests).toContain("POST /api/servers/example-server-local/agents/example-agent-local/connection-test")
  expect(state?.configurationReadiness().models.map((model) => model.id)).toEqual(["codex-model", "codex-next"])
  expect(state?.configurationReadiness().connectionTestStatus).toBe("success")
  dispose()
})

test("workspace configuration updates an agent with only the fixed provider secret reference", async () => {
  let updateBody: unknown
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        const url = String(input)
        if (url === "/api/servers/example-server-local/agents/example-agent-local" && init?.method === "PATCH") {
          updateBody = JSON.parse(String(init.body))
          return response(
            representation({
              agent: {
                configuration: {
                  apiKey: "$CLIPROXYAPI_API_KEY",
                  baseUrl: "https://cli-updated.example.com/v1",
                  model: "cli-model",
                  provider: "cliproxyapi",
                },
                id: "example-agent-local",
                name: "Updated agent",
                role: "review",
                serverId: "example-server-local",
              },
            }),
          )
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  let configuration = state?.configurationReadiness()
  configuration?.draftNameChange("Updated agent")
  configuration?.draftRoleChange("review")
  configuration?.draftProviderChange("cliproxyapi")
  configuration?.draftBaseUrlChange("https://cli-updated.example.com/v1")
  configuration?.draftModelChange("cli-model")
  await state?.configurationReadiness().save()

  expect(updateBody).toEqual({
    configuration: {
      apiKey: "$CLIPROXYAPI_API_KEY",
      baseUrl: "https://cli-updated.example.com/v1",
      model: "cli-model",
      provider: "cliproxyapi",
      tools: { bash: false, webfetch: false },
    },
    name: "Updated agent",
    role: "review",
  })
  expect(JSON.stringify(updateBody)).not.toContain("secret-key")
  dispose()
})

test("an agent-less server exposes creation and surfaces provider API errors", async () => {
  let created = false
  let createBody: unknown
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        const url = String(input)
        if (url === "/api/servers/example-server-local/agents" && (init?.method ?? "GET") === "GET") {
          return response(
            created
              ? representation(
                  {
                    agents: [
                      {
                        id: "created-agent",
                        name: "Created agent",
                        parentAgentId: null,
                        role: "primary",
                        serverId: "example-server-local",
                      },
                    ],
                  },
                  2,
                )
              : representation({ agents: [] }),
          )
        }
        if (url === "/api/servers/example-server-local/agents/models") {
          return response(
            { error: { code: "internal_server_error", message: "Gateway unavailable." } },
            { status: 500 },
          )
        }
        if (url === "/api/servers/example-server-local/agents" && init?.method === "POST") {
          createBody = JSON.parse(String(init.body))
          created = true
          return response(
            representation({
              agent: {
                ...(createBody as { name: string; role: string }),
                configuration: (createBody as { configuration: unknown }).configuration,
                id: "created-agent",
                serverId: "example-server-local",
              },
            }),
            { status: 201 },
          )
        }
        if (url === "/api/servers/example-server-local/agents/created-agent") {
          return response(
            representation({
              agent: {
                ...(createBody as { name: string; role: string }),
                configuration: (createBody as { configuration: unknown }).configuration,
                id: "created-agent",
                serverId: "example-server-local",
              },
            }),
          )
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.configurationReadiness().status).toBe("no-agent")
  const configuration = state?.configurationReadiness()
  configuration?.draftNameChange("Created agent")
  configuration?.draftBaseUrlChange("https://codex-created.example.com/v1")
  configuration?.draftModelChange("created-model")
  await state?.configurationReadiness().modelsDiscover()
  expect(state?.configurationReadiness().errorMessage).toBe("Gateway unavailable.")

  await state?.configurationReadiness().save()
  await effectsSettle()
  expect((createBody as { configuration: { apiKey: string } }).configuration.apiKey).toBe("$CODEX_LB_API_TOKEN")
  expect(state?.selectedAgentId()).toBe("created-agent")
  expect(state?.configurationReadiness().status).toBe("ready")
  dispose()
})

function deferredCreate<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

test("a late agent response for a superseded server cannot overwrite the current agents", async () => {
  const gates = new Map<string, ReturnType<typeof deferredCreate<void>>>()
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        const url = String(input)
        const agentMatch = /^\/api\/servers\/([^/]+)\/agents$/.exec(url)
        if (agentMatch?.[1] !== undefined) {
          const gate = deferredCreate<void>()
          gates.set(decodeURIComponent(agentMatch[1]), gate)
          await gate.promise
        }
        if (String(input) === "/api/servers/example-server-local/agents") {
          return response({ error: { code: "internal_server_error", message: "stale" } }, { status: 500 })
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  // The first server's agent request is still in flight while the selection moves on.
  expect(gates.has("example-server-local")).toBe(true)
  expect(state?.agentStatus()).toBe("loading")
  state?.serverSelect("example-server-remote")
  await effectsSettle()
  expect(gates.has("example-server-remote")).toBe(true)

  // The superseded response lands last and must be ignored entirely.
  gates.get("example-server-remote")?.resolve()
  await effectsSettle()
  expect(state?.selectedAgentId()).toBe("example-agent-remote")
  expect(state?.agents().map((agent) => agent.id)).toEqual(["example-agent-remote"])
  expect(state?.configurationReadiness().status).toBe("ready")

  gates.get("example-server-local")?.resolve()
  await effectsSettle()
  expect(state?.selectedServerId()).toBe("example-server-remote")
  expect(state?.selectedAgentId()).toBe("example-agent-remote")
  expect(state?.agents().map((agent) => agent.id)).toEqual(["example-agent-remote"])
  expect(state?.agentStatus()).toBe("ready")
  dispose()
})

test("a late server response from a superseded reload cannot overwrite the current servers", async () => {
  const gates: Array<ReturnType<typeof deferredCreate<void>>> = []
  const bodies = [{ servers: [{ id: "stale-server", name: "Stale Server" }] }, servers]
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        const url = String(input)
        if (url === "/api/servers") {
          const gate = deferredCreate<void>()
          gates.push(gate)
          const body = bodies[gates.length - 1] ?? servers
          await gate.promise
          return response(body)
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()
  expect(gates).toHaveLength(1)
  expect(state?.serverStatus()).toBe("loading")

  state?.serversReload()
  await effectsSettle()
  expect(gates).toHaveLength(2)

  // The newer reload settles first, then the superseded first request settles.
  gates[1]?.resolve()
  await effectsSettle()
  expect(state?.servers().map((server) => server.id)).toEqual(["example-server-local", "example-server-remote"])

  gates[0]?.resolve()
  await effectsSettle()
  expect(state?.servers().map((server) => server.id)).toEqual(["example-server-local", "example-server-remote"])
  expect(state?.selectedServerId()).toBe("example-server-local")
  expect(state?.serverStatus()).toBe("ready")
  dispose()
})

test("the agent state mirrors the server state while servers are loading or failing", async () => {
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate([], {
        "/api/servers": () => response({ error: { code: "internal_server_error", message: "no" } }, { status: 500 }),
      }),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  expect(state?.configurationReadiness().status).toBe("loading")
  expect(state?.serverStatus()).toBe("loading")
  expect(state?.agentStatus()).toBe("loading")

  await effectsSettle()
  expect(state?.serverStatus()).toBe("error")
  expect(state?.agentStatus()).toBe("error")
  expect(state?.configurationReadiness().status).toBe("server-error")
  dispose()
})

test("a retry after an ambiguous failure reuses the client request id until the target changes", async () => {
  const bodies: string[] = []
  let created = 0
  let failing = true
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      clientRequestIdCreate: () => `request-${(created += 1)}`,
      fetch: async (input, init) => {
        if (String(input) === "/api/sessions" && init?.method === "POST") {
          bodies.push(String(init.body))
          if (failing) return response({ error: { code: "conflict", message: "unclear" } }, { status: 500 })
          return response({ created: true, session: { id: "created-session" } }, { status: 201 })
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  await state?.sessionCreateStart()
  expect(state?.sessionCreateStatus()).toBe("error")
  await state?.sessionCreateStart()

  const requestIds = bodies.map((body) => (JSON.parse(body) as { clientRequestId: string }).clientRequestId)
  expect(requestIds).toEqual(["request-1", "request-1"])

  // Changing the target starts a new intent with a fresh id.
  failing = false
  state?.agentSelect("example-agent-local-review")
  expect(state?.sessionCreateStatus()).toBe("idle")
  await state?.sessionCreateStart()
  const afterChange = bodies.map((body) => (JSON.parse(body) as { clientRequestId: string }).clientRequestId)
  expect(afterChange).toEqual(["request-1", "request-1", "request-2"])
  dispose()
})

test("a create that settles after disposal neither navigates nor updates state", async () => {
  const selected: string[] = []
  const gate = deferredCreate<void>()
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        if (String(input) === "/api/sessions" && init?.method === "POST") {
          await gate.promise
          return response({ created: true, session: { id: "created-session" } }, { status: 201 })
        }
        return fetchDefaultCreate([])(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: (sessionId) => selected.push(sessionId),
    })
    return rootDispose
  })
  await effectsSettle()

  const pending = state?.sessionCreateStart()
  dispose()
  gate.resolve()
  await pending
  await effectsSettle()

  expect(selected).toEqual([])
  expect(state?.sessionCreateStatus()).toBe("creating")
})

test("navigating to a session loads its persisted target without mutating the session", async () => {
  const requests: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetchDefaultCreate(requests),
      selectedSessionId: () => "example-session-remote-1",
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()

  expect(state?.selectedServerId()).toBe("example-server-remote")
  expect(state?.selectedAgentId()).toBe("example-agent-remote")
  expect(requests.filter((request) => request.startsWith("POST"))).toEqual([])
  expect(requests).toContain("GET /api/sessions/example-session-remote-1")
  dispose()
})

test("the shared account-scoped cache serves a second selector without a repeated request", async () => {
  const accountId = accountIdCreate()
  const requests: string[] = []
  const fetcher = fetchDefaultCreate(requests)
  let first: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const disposeFirst = createRoot((rootDispose) => {
    first = sessionTargetSelectorStateCreate({
      accountId,
      fetch: fetcher,
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()
  expect(first?.serverStatus()).toBe("ready")
  disposeFirst()

  let second: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const disposeSecond = createRoot((rootDispose) => {
    second = sessionTargetSelectorStateCreate({
      accountId,
      fetch: fetcher,
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })

  // The cached representation renders before the revalidation settles.
  expect(second?.servers().map((server) => server.id)).toEqual(["example-server-local", "example-server-remote"])
  await effectsSettle()
  expect(second?.serverStatus()).toBe("ready")
  disposeSecond()
})

test("a different account never reuses another account's cached servers", async () => {
  const requests: string[] = []
  const fetcher = fetchDefaultCreate(requests)
  const disposeFirst = createRoot((rootDispose) => {
    sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetcher,
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()
  disposeFirst()

  let second: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const disposeSecond = createRoot((rootDispose) => {
    second = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: fetcher,
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  expect(second?.servers()).toEqual([])
  await effectsSettle()
  expect(second?.serverStatus()).toBe("ready")
  disposeSecond()
})

test("a failed revalidation retains the cached servers and reports the stale data status", async () => {
  const accountId = accountIdCreate()
  let failing = false
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/servers" && failing) {
      return response({ error: { code: "internal_server_error", message: "no" } }, { status: 500 })
    }
    return fetchDefaultCreate([])(input, init)
  }
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId,
      fetch: fetcher,
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  await effectsSettle()
  expect(state?.dataStatus()).toBe("ready")

  failing = true
  state?.targetRevalidate()
  await effectsSettle()

  expect(state?.servers().map((server) => server.id)).toEqual(["example-server-local", "example-server-remote"])
  expect(state?.serverStatus()).toBe("ready")
  expect(state?.dataStatus()).toBe("stale")
  dispose()
})

test("the data status reports reconciling while a first load is in flight and offline when the tab is offline", async () => {
  const gate = deferredCreate<void>()
  let isOnline = true
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      accountId: accountIdCreate(),
      fetch: async (input, init) => {
        if (String(input) === "/api/servers") await gate.promise
        return fetchDefaultCreate([])(input, init)
      },
      isOnline: () => isOnline,
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })

  expect(state?.dataStatus()).toBe("reconciling")
  isOnline = false
  expect(state?.dataStatus()).toBe("offline")

  isOnline = true
  gate.resolve()
  await effectsSettle()
  expect(state?.dataStatus()).toBe("ready")
  dispose()
})
