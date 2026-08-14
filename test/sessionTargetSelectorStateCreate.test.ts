import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { sessionTargetSelectorStateCreate } from "../src/ui/sessionTargetSelectorStateCreate.js"

const response = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init)

const servers = {
  servers: [
    { id: "example-server-local", name: "Example Local Server" },
    { id: "example-server-remote", name: "Example Remote Server" },
  ],
}
const agentsByServer: Record<string, unknown> = {
  "example-server-local": {
    agents: [
      { id: "example-agent-local", name: "Example Coding Agent", role: "coding", serverId: "example-server-local" },
      {
        id: "example-agent-local-review",
        name: "Example Review Agent",
        role: "review",
        serverId: "example-server-local",
      },
    ],
  },
  "example-server-remote": {
    agents: [
      { id: "example-agent-remote", name: "Example Remote Agent", role: "coding", serverId: "example-server-remote" },
    ],
  },
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
      return response(agentsByServer[decodeURIComponent(agentMatch[1])] ?? { agents: [] })
    }
    if (url.startsWith("/api/sessions/")) {
      return response({ session: { primaryAgentId: "example-agent-remote", serverId: "example-server-remote" } })
    }
    return response({ created: true, session: { id: "created-session" } }, { status: 201 })
  }
}

test("selector loads servers and the agents of the default server", async () => {
  const requests: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
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
  expect(state?.selectedServerId()).toBe("example-server-local")
  expect(state?.selectedAgentId()).toBe("example-agent-local")
  expect(state?.pendingTarget()).toEqual({ agentId: "example-agent-local", serverId: "example-server-local" })
  expect(requests).toContain("GET /api/servers")
  expect(requests).toContain("GET /api/servers/example-server-local/agents")
  dispose()
})

test("selecting another server reloads its agents without creating a session", async () => {
  const requests: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
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
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      clientRequestIdCreate: () => "deterministic-request",
      fetch: async (input, init) => {
        if (init?.method === "POST") bodies.push(String(init.body))
        return fetchDefaultCreate(requests)(input, init)
      },
      selectedSessionId: () => null,
      sessionSelect: (sessionId) => selected.push(sessionId),
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
    serverId: "example-server-local",
    title: "New session",
  })
  expect(selected).toEqual(["created-session"])
  expect(state?.sessionCreateStatus()).toBe("idle")
  dispose()
})

test("a failed create reports an error without navigating", async () => {
  const selected: string[] = []
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
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

  failing = false
  state?.serversReload()
  await effectsSettle()

  expect(state?.serverStatus()).toBe("ready")
  expect(state?.selectedServerId()).toBe("example-server-local")
  expect(requests.filter((url) => url === "/api/servers")).toHaveLength(2)
  dispose()
})

test("an empty server list keeps the selector empty and blocks creation", async () => {
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
      fetch: fetchDefaultCreate([], { "/api/servers": () => response({ servers: [] }) }),
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
  dispose()
})

test("an invalid response body is rejected as an error", async () => {
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
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
      fetch: async (input, init) => {
        const url = String(input)
        const agentMatch = /^\/api\/servers\/([^/]+)\/agents$/.exec(url)
        if (agentMatch?.[1] !== undefined) {
          const gate = deferredCreate<void>()
          gates.set(decodeURIComponent(agentMatch[1]), gate)
          await gate.promise
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
      fetch: fetchDefaultCreate([], {
        "/api/servers": () => response({ error: { code: "internal_server_error", message: "no" } }, { status: 500 }),
      }),
      selectedSessionId: () => null,
      sessionSelect: () => undefined,
    })
    return rootDispose
  })
  expect(state?.serverStatus()).toBe("loading")
  expect(state?.agentStatus()).toBe("loading")

  await effectsSettle()
  expect(state?.serverStatus()).toBe("error")
  expect(state?.agentStatus()).toBe("error")
  dispose()
})

test("a retry after an ambiguous failure reuses the client request id until the target changes", async () => {
  const bodies: string[] = []
  let created = 0
  let failing = true
  let state: ReturnType<typeof sessionTargetSelectorStateCreate> | undefined
  const dispose = createRoot((rootDispose) => {
    state = sessionTargetSelectorStateCreate({
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
