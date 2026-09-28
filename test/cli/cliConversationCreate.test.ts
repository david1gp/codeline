import { describe, expect, it } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { cliBackendAcquire } from "../../src/cli/cliBackendAcquire.js"
import { cliConversationCreate } from "../../src/cli/cliConversationCreate.js"
import type { cliLocalRuntimeCreate } from "../../src/cli/cliLocalRuntimeCreate.js"

const options = { backend: { serverUrl: "https://remote.test" } } as const

function responseFinal(runId: string, sessionId: string, answer: string) {
  return Response.json({
    kind: "finalized",
    detail: {
      run: { id: runId, sessionId, status: "succeeded", cancellationKind: null, failure: null },
      tools: [],
      transcript: {
        activities: [],
        assistantText: answer,
        attempts: [],
        cancellation: null,
        failure: null,
        invariantViolations: [],
        terminalOutcome: { status: "completed" },
      },
    },
  })
}

function remoteFixtureCreate() {
  const requests: { path: string; init?: RequestInit }[] = []
  const submitted: string[] = []
  let creationCount = 0
  let hold: ((response: Response) => void) | undefined
  let onRequest: ((path: string) => void) | undefined
  const context = {
    env: { CODELINE_SESSION_TOKEN: "test-cookie" },
    pollingDelay: async () => {},
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const path = new URL(String(input)).pathname
      requests.push({ path, init })
      onRequest?.(path)
      if (hold && (path === "/api/sessions" || path.endsWith("/chat")))
        return new Promise<Response>((resolve) => {
          hold = resolve
        })
      if (path === "/api/servers")
        return Response.json({
          servers: [{ id: "server-1", name: "Server" }],
          etag: '"1"',
          revision: 1,
          schemaVersion: "1",
        })
      if (path.endsWith("/agents"))
        return Response.json({
          agents: [{ id: "agent-1", serverId: "server-1", parentAgentId: null, role: "primary", name: "Agent" }],
          etag: '"1"',
          revision: 1,
          schemaVersion: "1",
        })
      if (path === "/api/sessions") {
        creationCount++
        return Response.json({
          created: true,
          session: {
            id: "session-1",
            serverId: "server-1",
            primaryAgentId: "agent-1",
            projectPath: "/project",
            title: "First",
            metadata: {},
            revision: 1,
            pinned: false,
            archivedAt: null,
            parentSessionId: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        })
      }
      if (path.endsWith("/chat")) {
        submitted.push(JSON.parse(String(init?.body)).messages[0].content)
        return Response.json({ runId: `run-${submitted.length}`, sessionId: "session-1" })
      }
      if (path.endsWith("/snapshot")) return Response.json({ lastSequence: 1, status: "succeeded", partialText: "" })
      if (path.endsWith("/detail")) return responseFinal(path.split("/")[5]!, "session-1", `Answer ${submitted.length}`)
      if (path.endsWith("/cancel")) return Response.json({ cancelledRunIds: [path.split("/")[5]], signalledRunIds: [] })
      throw new Error(`Unexpected request ${path}`)
    },
  }
  return {
    context,
    requests,
    submitted,
    creationCount: () => creationCount,
    holdNext: () => {
      hold = () => {}
    },
    release: (response: Response) => {
      const resolve = hold
      hold = undefined
      resolve?.(response)
    },
    onRequestSet: (callback: (path: string) => void) => {
      onRequest = callback
    },
  }
}

describe("persistent conversation controller", () => {
  it("creates one remote session, streams each turn and reuses it without rediscovery", async () => {
    const fixture = remoteFixtureCreate()
    const sessions: string[] = []
    const opened = await cliConversationCreate({
      options,
      context: fixture.context,
      onSession: (id) => sessions.push(id),
    })
    expect(opened.success).toBe(true)
    if (!opened.success) return
    const controller = opened.data
    const text: string[] = []
    expect((await controller.prompt("First", (delta) => text.push(delta))).success).toBe(true)
    expect(controller.sessionId()).toBe("session-1")
    expect((await controller.prompt("Second", (delta) => text.push(delta))).success).toBe(true)
    expect(text).toEqual(["Answer 1", "Answer 2"])
    expect(sessions).toEqual(["session-1", "session-1"])
    expect(fixture.creationCount()).toBe(1)
    expect(fixture.submitted).toEqual(["First", "Second"])
    expect(fixture.requests.filter(({ path }) => path === "/api/servers")).toHaveLength(1)
    expect((await controller.shutdown()).success).toBe(true)
    expect((await controller.prompt("Third", () => {})).success).toBe(false)
  })

  it("cancels admission on shutdown after it settles, then closes to further prompts", async () => {
    const fixture = remoteFixtureCreate()
    fixture.holdNext()
    const opened = await cliConversationCreate({
      options: { ...options, session: "session-1" },
      context: fixture.context,
    })
    expect(opened.success).toBe(true)
    if (!opened.success) return
    const controller = opened.data
    const admissionReached = new Promise<void>((resolve) =>
      fixture.onRequestSet((path) => {
        if (path.endsWith("/chat")) resolve()
      }),
    )
    const pending = controller.prompt("First", () => {})
    await admissionReached
    expect(fixture.requests.at(-1)?.path).toEndWith("/chat")
    const competing = await controller.prompt("Second", () => {})
    expect(competing.success).toBe(false)
    if (!competing.success) expect(competing.errorMessage).toContain("already active")
    const admissionSignal = fixture.requests.at(-1)?.init?.signal
    const closed = controller.shutdown()
    expect(admissionSignal?.aborted).toBe(false)
    fixture.release(Response.json({ runId: "durable-run", sessionId: "session-1" }))
    const outcome = await pending
    expect(outcome.success).toBe(false)
    expect(fixture.requests.at(-1)?.path).toBe("/api/sessions/session-1/runs/durable-run/cancel")
    expect((await closed).success).toBe(true)
    expect(await controller.shutdown()).toBe(await closed)
    expect((await controller.prompt("again", () => {})).success).toBe(false)
  })

  it("interrupts during session creation without admitting a chat and permits a later turn", async () => {
    const fixture = remoteFixtureCreate()
    fixture.holdNext()
    const opened = await cliConversationCreate({ options, context: fixture.context })
    expect(opened.success).toBe(true)
    if (!opened.success) return
    const controller = opened.data
    const creationReached = new Promise<void>((resolve) =>
      fixture.onRequestSet((path) => {
        if (path === "/api/sessions") resolve()
      }),
    )
    const pending = controller.prompt("First", () => {})
    await creationReached
    controller.cancel()
    fixture.release(
      Response.json({
        created: true,
        session: {
          id: "session-1",
          serverId: "server-1",
          primaryAgentId: "agent-1",
          projectPath: "/project",
          title: "First",
          metadata: {},
          revision: 1,
          pinned: false,
          archivedAt: null,
          parentSessionId: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    )
    expect((await pending).success).toBe(false)
    expect(fixture.requests.some(({ path }) => path.endsWith("/chat"))).toBe(false)
    // An aborted session POST may not deliver its response to the transport; retry may create a new session.
    expect((await controller.prompt("Second", () => {})).success).toBe(true)
    expect(controller.sessionId()).toBe("session-1")
    expect(fixture.creationCount()).toBeLessThanOrEqual(1)
    expect((await controller.shutdown()).success).toBe(true)
  })

  it("cancels only the active run and allows the next turn on the same session", async () => {
    const fixture = remoteFixtureCreate()
    const opened = await cliConversationCreate({
      options: { ...options, session: "session-1" },
      context: fixture.context,
    })
    expect(opened.success).toBe(true)
    if (!opened.success) return
    const controller = opened.data
    fixture.onRequestSet((path) => {
      if (path.endsWith("/snapshot")) controller.cancel()
    })
    const first = await controller.prompt("First", () => {})
    expect(first.success).toBe(false)
    expect(fixture.requests.at(-1)?.path).toEndWith("/cancel")
    fixture.onRequestSet(() => {})
    expect((await controller.prompt("Second", () => {})).success).toBe(true)
    expect(fixture.creationCount()).toBe(0)
    expect((await controller.shutdown()).success).toBe(true)
  })
})

describe("shared backend acquisition", () => {
  it("requires a temporary remote token and rejects conflicting session/project before opening", async () => {
    const missing = await cliBackendAcquire({ options, context: { env: {} } })
    expect(missing.success).toBe(false)
    if (!missing.success) expect(missing.errorMessage).toContain("CODELINE_SESSION_TOKEN")
    const conflict = await cliBackendAcquire({
      options: { ...options, session: "s", project: "p" },
      context: { env: { CODELINE_SESSION_TOKEN: "test-cookie" } },
    })
    expect(conflict.success).toBe(false)
    if (!conflict.success) expect(conflict.errorMessage).toContain("not both")
  })

  it("rejects an explicit local project combined with a session before opening the runtime", async () => {
    let opened = false
    const result = await cliBackendAcquire({
      options: { backend: "local", session: "session-1", project: "/explicit" },
      context: {
        localRuntimeCreate: (async () => {
          opened = true
          throw new Error("Must not open")
        }) as typeof cliLocalRuntimeCreate,
      },
    })
    expect(result.success).toBe(false)
    expect(opened).toBe(false)
  })

  it("opens local in-process without token or network fetch and releases an interrupted acquisition", async () => {
    let release!: (value: ReturnType<typeof createResult>) => void
    let shutdowns = 0
    let calls = 0
    const localRuntimeCreate = (async () => {
      calls++
      return new Promise((resolve) => {
        release = resolve as typeof release
      })
    }) as unknown as typeof cliLocalRuntimeCreate
    const signal = new AbortController()
    const acquiring = cliBackendAcquire({
      options: { backend: "local" },
      signal: signal.signal,
      context: {
        env: { HOME: "/isolated", XDG_DATA_HOME: "/isolated/data" },
        localRuntimeCreate,
        fetch: async () => {
          throw new Error("Network used")
        },
      },
    })
    expect(calls).toBe(1)
    signal.abort()
    release(
      createResult({
        fetch: async () => Response.json({}),
        projectPath: "/project",
        target: { serverId: "local", agentId: "agent" },
        shutdown: async () => {
          shutdowns++
          return createResult(undefined)
        },
      }),
    )
    expect((await acquiring).success).toBe(false)
    expect(shutdowns).toBe(1)
  })

  it("holds a single local runtime across turns and shuts it down once", async () => {
    const fixture = remoteFixtureCreate()
    const headers: Headers[] = []
    let opens = 0
    let shutdowns = 0
    const localRuntimeCreate = (async () => {
      opens++
      return createResult({
        projectPath: "/canonical/project",
        target: { serverId: "local", agentId: "agent" },
        fetch: async (request: Request) => {
          headers.push(request.headers)
          return fixture.context.fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.method === "POST" ? await request.text() : undefined,
          })
        },
        shutdown: async () => {
          shutdowns++
          return createResult(undefined)
        },
      })
    }) as unknown as typeof cliLocalRuntimeCreate
    const opened = await cliConversationCreate({
      options: { backend: "local" },
      context: {
        env: { HOME: "/isolated", XDG_DATA_HOME: "/isolated/data" },
        localRuntimeCreate,
        pollingDelay: async () => {},
      },
    })
    expect(opened.success).toBe(true)
    if (!opened.success) return
    const controller = opened.data
    expect((await controller.prompt("First", () => {})).success).toBe(true)
    expect((await controller.prompt("Second", () => {})).success).toBe(true)
    expect(opens).toBe(1)
    expect(fixture.creationCount()).toBe(1)
    expect(headers.every((header) => !header.has("Cookie") && !header.has("Origin"))).toBe(true)
    expect((await controller.shutdown()).success).toBe(true)
    expect(shutdowns).toBe(1)
  })

  it("does not close the local runtime until admission and cancellation complete", async () => {
    const fixture = remoteFixtureCreate()
    fixture.holdNext()
    let shutdowns = 0
    const localRuntimeCreate = (async () =>
      createResult({
        projectPath: "/canonical/project",
        target: { serverId: "local", agentId: "agent" },
        fetch: async (request: Request) =>
          fixture.context.fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.method === "POST" ? await request.text() : undefined,
          }),
        shutdown: async () => {
          shutdowns++
          return createResult(undefined)
        },
      })) as unknown as typeof cliLocalRuntimeCreate
    const opened = await cliConversationCreate({
      options: { backend: "local", session: "session-1" },
      context: { env: { HOME: "/isolated" }, localRuntimeCreate },
    })
    expect(opened.success).toBe(true)
    if (!opened.success) return
    const controller = opened.data
    const admissionReached = new Promise<void>((resolve) =>
      fixture.onRequestSet((path) => {
        if (path.endsWith("/chat")) resolve()
      }),
    )
    const pending = controller.prompt("First", () => {})
    await admissionReached
    const stopping = controller.shutdown()
    expect(shutdowns).toBe(0)
    fixture.release(Response.json({ runId: "durable-run", sessionId: "session-1" }))
    expect((await pending).success).toBe(false)
    expect(fixture.requests.at(-1)?.path).toEndWith("/cancel")
    expect((await stopping).success).toBe(true)
    expect(shutdowns).toBe(1)
  })
})
