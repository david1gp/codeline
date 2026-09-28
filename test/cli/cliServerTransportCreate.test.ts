import { describe, expect, it } from "bun:test"
import { cliServerTransportCreate } from "../../src/cli/cliServerTransportCreate.js"

const sessionId = "session-1"
const runId = "run-1"

describe("cliServerTransportCreate", () => {
  it("uses the shared typed requests in local mode without remote authentication headers or network fetch", async () => {
    const requests: Request[] = []
    const transport = cliServerTransportCreate({
      local: true,
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return Response.json({ runId, sessionId })
      },
    })
    if (!transport.success) throw new Error(transport.errorMessage)
    expect(
      await transport.data.chatSubmit(sessionId, {
        messages: [{ content: "hello", id: "message-1", role: "user" }],
        runId,
        threadId: sessionId,
      }),
    ).toMatchObject({ success: true, data: { runId, sessionId } })
    expect(requests[0]?.url).toBe("http://local.invalid/api/sessions/session-1/chat")
    expect(requests[0]?.headers.has("Cookie")).toBe(false)
    expect(requests[0]?.headers.has("Origin")).toBe(false)
    expect(requests[0]?.headers.get("Content-Type")).toBe("application/json")
  })

  it("sends typed mutations with the in-memory cookie and server origin", async () => {
    const requests: { url: string; init?: RequestInit }[] = []
    const transport = cliServerTransportCreate({
      baseUrl: "https://example.test/prefix/",
      sessionToken: "opaque-token",
      fetch: async (input, init) => {
        requests.push({ url: String(input), init })
        const response =
          requests.length === 1
            ? {
                created: true,
                session: {
                  archivedAt: null,
                  createdAt: "2026-01-01T00:00:00.000Z",
                  id: sessionId,
                  metadata: {},
                  parentSessionId: null,
                  pinned: false,
                  primaryAgentId: "agent",
                  projectPath: "/work",
                  revision: 1,
                  serverId: "server",
                  title: "CLI",
                  updatedAt: "2026-01-01T00:00:00.000Z",
                },
              }
            : requests.length === 2
              ? { runId, sessionId }
              : { cancelledRunIds: [runId], signalledRunIds: [runId] }
        return Response.json(response)
      },
    })
    expect(transport.success).toBe(true)
    if (!transport.success) return

    const created = await transport.data.sessionCreate({
      clientRequestId: "request-1",
      primaryAgentId: "agent",
      projectPath: "/work",
      serverId: "server",
      title: "CLI",
    })
    expect(created.success).toBe(true)
    if (created.success) expect(created.data.session.id).toBe(sessionId)
    const submitted = await transport.data.chatSubmit(sessionId, {
      messages: [{ content: "hello", id: "message-1", role: "user" }],
      runId,
      threadId: sessionId,
    })
    expect(submitted.success).toBe(true)
    const cancelled = await transport.data.runCancel(sessionId, runId)
    expect(cancelled.success).toBe(true)
    if (cancelled.success) expect(cancelled.data.cancelledRunIds).toEqual([runId])

    expect(requests.map(({ url }) => url)).toEqual([
      "https://example.test/prefix/api/sessions",
      "https://example.test/prefix/api/sessions/session-1/chat",
      "https://example.test/prefix/api/sessions/session-1/runs/run-1/cancel",
    ])
    for (const { init } of requests) {
      const headers = new Headers(init?.headers)
      expect(headers.get("Cookie")).toBe("__Host-codeline-session=opaque-token")
      expect(headers.get("Origin")).toBe("https://example.test")
      expect(headers.has("Host")).toBe(false)
      expect(init?.method).toBe("POST")
      expect(init?.redirect).toBe("error")
    }
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({ clientRequestId: "request-1" })
    expect(JSON.parse(String(requests[1]?.init?.body))).toMatchObject({ runId, threadId: sessionId })
  })

  it("replays a run event feed from its last cursor and stops on terminal completion", async () => {
    const requests: { url: string; init?: RequestInit }[] = []
    let streamCancelled = false
    const completedFrame = {
      changePosition: 1,
      eventType: "run-completed",
      globalSequence: 2,
      id: "cursor-2",
      messageId: null,
      runId,
      sessionId,
      sessionRevision: 2,
    }
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input))
      requests.push({ url: url.href, init })
      if (requests.length === 1)
        return new Response(
          'id: cursor-1\nevent: run-started\ndata: {"eventType":"run-started","globalSequence":1,"id":"cursor-1","runId":"other-run","sessionId":"other-session"}\n\n',
          { headers: { "Content-Type": "text/event-stream" } },
        )
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                `id: cursor-2\nevent: run-completed\ndata: ${JSON.stringify(completedFrame)}\n\n`,
              ),
            )
          },
          cancel() {
            streamCancelled = true
          },
        }),
        {
          headers: { "Content-Type": "text/event-stream" },
        },
      )
    }
    const transport = cliServerTransportCreate({
      baseUrl: "https://example.test/prefix",
      sessionToken: "opaque-token",
      fetch,
    })
    expect(transport.success).toBe(true)
    if (!transport.success) return

    const frames = []
    for await (const frame of transport.data.runEvents(sessionId, runId)) frames.push(frame)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      success: true,
      data: { event: "run-completed", id: "cursor-2", data: completedFrame },
    })
    expect(streamCancelled).toBe(true)
    expect(requests.map(({ url }) => url)).toEqual([
      "https://example.test/prefix/api/events",
      "https://example.test/prefix/api/events?after=cursor-1",
    ])
    for (const { init } of requests) {
      const headers = new Headers(init?.headers)
      expect(headers.get("Cookie")).toBe("__Host-codeline-session=opaque-token")
      expect(headers.get("Accept")).toBe("text/event-stream")
      expect(headers.has("Origin")).toBe(false)
      expect(init?.redirect).toBe("error")
    }
  })

  it("uses an explicit public origin for unsafe requests when the upstream URL differs", async () => {
    let url = ""
    let origin = ""
    let host = ""
    const transport = cliServerTransportCreate({
      baseUrl: "http://upstream.test/prefix",
      publicOrigin: "https://public.test/",
      sessionToken: "opaque-token",
      fetch: async (input, init) => {
        url = String(input)
        origin = new Headers(init?.headers).get("Origin") ?? ""
        host = new Headers(init?.headers).get("Host") ?? ""
        return Response.json({ runId, sessionId })
      },
    })
    expect(transport.success).toBe(true)
    if (!transport.success) return
    const submitted = await transport.data.chatSubmit(sessionId, {
      messages: [{ content: "hello", id: "message-1", role: "user" }],
      runId,
      threadId: sessionId,
    })
    expect(submitted).toMatchObject({ success: true, data: { runId, sessionId } })
    expect(url).toBe("http://upstream.test/prefix/api/sessions/session-1/chat")
    expect(origin).toBe("https://public.test")
    expect(host).toBe("public.test")
  })

  it("rejects invalid server URLs and cookie tokens", () => {
    expect(cliServerTransportCreate({ baseUrl: "javascript:alert(1)", sessionToken: "token" }).success).toBe(false)
    expect(
      cliServerTransportCreate({ baseUrl: "https://example.test", sessionToken: "token\r\nCookie:x" }).success,
    ).toBe(false)
    for (const publicOrigin of ["javascript:alert(1)", "https://public.test/path", "https://public.test/?q=1"]) {
      expect(
        cliServerTransportCreate({ baseUrl: "https://example.test", publicOrigin, sessionToken: "token" }).success,
      ).toBe(false)
    }
  })

  it("reads shared snapshots without caching and passes an abort signal to fetch", async () => {
    const controller = new AbortController()
    const requests: { url: string; init?: RequestInit }[] = []
    const transport = cliServerTransportCreate({
      baseUrl: "https://example.test/prefix",
      sessionToken: "opaque-token",
      fetch: async (input, init) => {
        requests.push({ url: String(input), init })
        return Response.json({ lastSequence: 3, partialText: "Hello", status: "running" })
      },
    })
    if (!transport.success) throw new Error("Transport creation failed")
    expect(await transport.data.runSnapshot("session/one", "run?one", controller.signal)).toMatchObject({
      success: true,
      data: { lastSequence: 3, partialText: "Hello", status: "running" },
    })
    expect(requests[0]?.url).toBe("https://example.test/prefix/api/sessions/session%2Fone/runs/run%3Fone/snapshot")
    const init = requests[0]?.init
    expect(init?.cache).toBe("no-store")
    expect(init?.method).toBe("GET")
    expect(init?.signal).toBe(controller.signal)
    expect(init?.redirect).toBe("error")
    const headers = new Headers(init?.headers)
    expect(headers.get("Cookie")).toBe("__Host-codeline-session=opaque-token")
    expect(headers.has("Origin")).toBe(false)
  })

  it("validates outgoing chat requests before fetching and incoming snapshot contracts", async () => {
    let calls = 0
    const transport = cliServerTransportCreate({
      baseUrl: "https://example.test",
      sessionToken: "opaque-token",
      fetch: async () => {
        calls += 1
        return Response.json({ lastSequence: 1, partialText: 123, status: "running" })
      },
    })
    if (!transport.success) throw new Error("Transport creation failed")
    expect(await transport.data.chatSubmit(sessionId, { messages: [], runId, threadId: sessionId })).toMatchObject({
      success: false,
      code: "invalid_request",
    })
    expect(calls).toBe(0)
    expect(await transport.data.runSnapshot(sessionId, runId)).toMatchObject({
      success: false,
      code: "invalid_response",
    })
    expect(calls).toBe(1)
  })

  it("preserves typed API authentication failures and hides thrown fetch details", async () => {
    const transport = cliServerTransportCreate({
      baseUrl: "https://example.test",
      sessionToken: "opaque-token",
      fetch: async (input) => {
        if (String(input).endsWith("/snapshot"))
          return Response.json(
            {
              error: { code: "identity.unauthenticated", message: "Sign in required.", retryable: false, status: 401 },
            },
            { status: 401 },
          )
        throw new Error("private upstream diagnostics")
      },
    })
    if (!transport.success) throw new Error("Transport creation failed")
    expect(await transport.data.runSnapshot(sessionId, runId)).toMatchObject({
      success: false,
      code: "identity.unauthenticated",
      errorMessage: "Sign in required.",
      statusCode: 401,
    })
    expect(await transport.data.runCancel(sessionId, runId)).toMatchObject({
      success: false,
      code: "network_error",
      errorMessage: "The request could not be completed.",
    })
  })
})
