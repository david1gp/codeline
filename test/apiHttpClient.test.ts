import { expect, test } from "bun:test"
import * as v from "valibot"
import { apiHttpClientCreate } from "../src/api/client/apiHttpClientCreate.js"
import { apiQueryKeyCreate } from "../src/api/client/apiQueryKeyCreate.js"
import { healthResponseSchema } from "../src/api/health/healthResponseSchema.js"
import { noteListFetch } from "../src/note/client/noteListFetch.js"
import { sessionListPageLoad } from "../src/session/client/sessionListPageLoad.js"

test("canonical query keys sort names and retain repeated-value order", () => {
  expect(apiQueryKeyCreate("/api/sessions?z=last&a=first", { b: 2, a: ["second", "third"] })).toBe(
    "/api/sessions?a=first&a=second&a=third&b=2&z=last",
  )
})

test("canonical query keys use deterministic code-unit ordering", () => {
  expect(apiQueryKeyCreate("/api/health?é=accent&z=letter")).toBe("/api/health?z=letter&%C3%A9=accent")
})

test("typed HTTP requests validate bodies and responses through injected fetch", async () => {
  const requests: Array<{ body: string | undefined; method: string | undefined; url: string }> = []
  const requestSchema = v.strictObject({ title: v.string() })
  const client = apiHttpClientCreate({
    fetch: async (input, init) => {
      requests.push({ body: init?.body?.toString(), method: init?.method, url: String(input) })
      return Response.json({ service: "codeline", status: "ok" })
    },
  })

  const result = await client.post({
    body: { title: "A session" },
    op: "sessionCreate",
    path: "/api/sessions",
    requestSchema,
    responseSchema: healthResponseSchema,
  })

  expect(result).toEqual({ success: true, data: { service: "codeline", status: "ok" } })
  expect(requests).toEqual([{ body: '{"title":"A session"}', method: "POST", url: "/api/sessions" }])
})

test("session and note reads invoke a browser-shaped fetch dependency", async () => {
  const requests: string[] = []
  const fetcher = function (this: unknown, input: RequestInfo | URL): Promise<Response> {
    if (this !== undefined) throw new TypeError("Illegal invocation")
    const url = String(input)
    requests.push(url)
    if (url.startsWith("/api/sessions"))
      return Promise.resolve(
        Response.json({
          asOfCursor: "cursor-1",
          etag: '"sessions"',
          nextCursor: null,
          revision: 1,
          schemaVersion: "session-list.v3",
          sessions: [],
        }),
      )
    return Promise.resolve(Response.json([]))
  }
  const client = apiHttpClientCreate({ fetch: fetcher })

  const [sessions, notes] = await Promise.all([
    sessionListPageLoad(client, { limit: 25 }),
    noteListFetch({ fetch: fetcher }),
  ])

  expect(sessions.success).toBe(true)
  expect(notes.success).toBe(true)
  expect(requests).toHaveLength(2)
  expect(requests).toContain("/api/sessions?includeArchived=0&limit=25")
  expect(requests).toContain("/api/notes")
})

test("structured API errors become coded Results with HTTP status and body data", async () => {
  const client = apiHttpClientCreate({
    fetch: async () =>
      Response.json({ error: { code: "conflict", message: "The session is archived." } }, { status: 409 }),
  })

  const result = await client.get({
    op: "sessionLoad",
    path: "/api/sessions/session-1",
    responseSchema: healthResponseSchema,
  })

  expect(result).toMatchObject({
    code: "conflict",
    errorMessage: "The session is archived.",
    op: "sessionLoad",
    statusCode: 409,
    success: false,
  })
  if (!result.success)
    expect(JSON.parse(result.errorData ?? "{}")).toEqual({
      error: { code: "conflict", message: "The session is archived." },
    })
})

test("standard API errors preserve validated extension fields", async () => {
  const error = {
    code: "not_found",
    details: { resource: "session", sessionId: "session-1" },
    message: "The session was not found.",
    op: "sessionLoad",
    requestId: "request-1",
    retryable: false,
    status: 404,
  }
  const client = apiHttpClientCreate({ fetch: async () => Response.json({ error }, { status: 404 }) })

  const result = await client.get({ path: "/api/sessions/session-1", responseSchema: healthResponseSchema })

  expect(result).toMatchObject({ code: "not_found", statusCode: 404, success: false })
  if (!result.success) expect(JSON.parse(result.errorData ?? "{}")).toEqual({ error })
})

test("structured precondition errors retain current revision and ETag fields", async () => {
  const client = apiHttpClientCreate({
    fetch: async () =>
      Response.json(
        {
          error: {
            code: "precondition_failed",
            currentEtag: '"session-revision-2"',
            currentRevision: 2,
            message: "The session changed.",
            op: "sessionRename",
            retryable: false,
            status: 412,
          },
        },
        { status: 412 },
      ),
  })

  const result = await client.patch({
    path: "/api/sessions/session-1",
    responseSchema: healthResponseSchema,
  })

  expect(result).toMatchObject({ code: "precondition_failed", statusCode: 412, success: false })
  if (!result.success)
    expect(JSON.parse(result.errorData ?? "{}")).toMatchObject({
      error: { currentEtag: '"session-revision-2"', currentRevision: 2 },
    })
})

test("identical GET requests coalesce without sharing caller abort state", async () => {
  let fetchCount = 0
  let fetchSignal: AbortSignal | null | undefined
  let resolveResponse: ((response: Response) => void) | undefined
  const client = apiHttpClientCreate({
    fetch: async (_input, init) => {
      fetchCount += 1
      fetchSignal = init?.signal
      return new Promise((resolve) => {
        resolveResponse = resolve
      })
    },
  })
  const controller = new AbortController()
  const first = client.get({
    op: "firstLoad",
    path: "/api/health?b=2&a=1",
    responseSchema: healthResponseSchema,
    signal: controller.signal,
  })
  const second = client.get({
    op: "secondLoad",
    path: "/api/health?a=1&b=2",
    responseSchema: healthResponseSchema,
  })

  expect(fetchCount).toBe(1)
  expect(fetchSignal).toBeUndefined()
  controller.abort()
  resolveResponse?.(Response.json({ service: "codeline", status: "ok" }))

  expect(await first).toMatchObject({ code: "aborted", op: "firstLoad", success: false })
  expect(await second).toEqual({ success: true, data: { service: "codeline", status: "ok" } })
})

test("a non-coalesced request remains aborted when injected fetch resolves late", async () => {
  let resolveResponse: ((response: Response) => void) | undefined
  const client = apiHttpClientCreate({
    fetch: async () =>
      new Promise((resolve) => {
        resolveResponse = resolve
      }),
  })
  const controller = new AbortController()
  const request = client.get({
    coalesce: false,
    path: "/api/health",
    responseSchema: healthResponseSchema,
    signal: controller.signal,
  })

  controller.abort()
  resolveResponse?.(Response.json({ service: "codeline", status: "ok" }))

  expect(await request).toMatchObject({ code: "aborted", success: false })
})

test("different canonical query keys issue independent GET requests", async () => {
  let fetchCount = 0
  const urls: string[] = []
  const client = apiHttpClientCreate({
    fetch: async (input) => {
      fetchCount += 1
      const url = String(input)
      urls.push(url)
      return Response.json({ service: "codeline", status: "ok" })
    },
  })

  await Promise.all([
    client.get({ path: "/api/health?page=1", responseSchema: healthResponseSchema }),
    client.get({ path: "/api/health?page=2", responseSchema: healthResponseSchema }),
  ])
  expect(fetchCount).toBe(2)
  expect(urls.sort()).toEqual(["/api/health?page=1", "/api/health?page=2"])
})

test("malformed successful responses return a Result error instead of throwing", async () => {
  const client = apiHttpClientCreate({ fetch: async () => new Response("not-json", { status: 200 }) })
  const result = await client.get({ path: "/api/health", responseSchema: healthResponseSchema })
  expect(result).toMatchObject({ code: "invalid_json", success: false })
})

test("malformed accepted-looking paths return a Result error instead of rejecting", async () => {
  const client = apiHttpClientCreate({ fetch: async () => Response.json({ service: "codeline", status: "ok" }) })
  const result = await client.get({ path: "/api/%ZZ", responseSchema: healthResponseSchema })
  expect(result).toMatchObject({ code: "invalid_request", success: false })
})

test("malformed runtime path values return a Result error instead of rejecting", async () => {
  const client = apiHttpClientCreate({ fetch: async () => Response.json({ service: "codeline", status: "ok" }) })
  const result = await client.get({ path: null as never, responseSchema: healthResponseSchema })
  expect(result).toMatchObject({ code: "invalid_request", success: false })
})

test("malformed injected fetch results return a Result error instead of rejecting", async () => {
  const client = apiHttpClientCreate({ fetch: async () => null as never })
  const result = await client.get({ path: "/api/health", responseSchema: healthResponseSchema })
  expect(result).toMatchObject({ code: "invalid_response", success: false })
})

test("bodyless requests omit body validation and Content-Type", async () => {
  const requests: Array<{ contentType: string | null; body: string | undefined; method: string | undefined }> = []
  const client = apiHttpClientCreate({
    fetch: async (_input, init) => {
      const headers = new Headers(init?.headers)
      requests.push({ body: init?.body?.toString(), contentType: headers.get("Content-Type"), method: init?.method })
      return Response.json({ service: "codeline", status: "ok" })
    },
  })

  await client.post({ path: "/api/sessions", responseSchema: healthResponseSchema })
  await client.delete({ path: "/api/sessions/session-1", responseSchema: healthResponseSchema })

  expect(requests).toEqual([
    { body: undefined, contentType: null, method: "POST" },
    { body: undefined, contentType: null, method: "DELETE" },
  ])
})

test("request and response contract failures return coded Results", async () => {
  let fetchCount = 0
  const client = apiHttpClientCreate({
    fetch: async () => {
      fetchCount += 1
      return Response.json({ service: "wrong", status: "ok" })
    },
  })
  const invalidRequest = await client.post({
    body: { title: 42 } as never,
    path: "/api/sessions",
    requestSchema: v.strictObject({ title: v.string() }),
    responseSchema: healthResponseSchema,
  })
  const invalidResponse = await client.get({ path: "/api/health", responseSchema: healthResponseSchema })

  expect(invalidRequest).toMatchObject({ code: "invalid_request", success: false })
  expect(invalidResponse).toMatchObject({ code: "invalid_response", success: false })
  expect(fetchCount).toBe(1)
})

test("mutations are never coalesced", async () => {
  let fetchCount = 0
  const client = apiHttpClientCreate({
    fetch: async () => {
      fetchCount += 1
      return Response.json({ service: "codeline", status: "ok" })
    },
  })

  await Promise.all([
    client.post({
      body: {},
      path: "/api/sessions",
      requestSchema: v.strictObject({}),
      responseSchema: healthResponseSchema,
    }),
    client.post({
      body: {},
      path: "/api/sessions",
      requestSchema: v.strictObject({}),
      responseSchema: healthResponseSchema,
    }),
  ])
  expect(fetchCount).toBe(2)
})

test("coalescing recovers after a shared request fails", async () => {
  let fetchCount = 0
  const client = apiHttpClientCreate({
    fetch: async () => {
      fetchCount += 1
      if (fetchCount === 1) throw new Error("temporary failure")
      return Response.json({ service: "codeline", status: "ok" })
    },
  })

  const first = client.get({ path: "/api/health", responseSchema: healthResponseSchema })
  const second = client.get({ path: "/api/health", responseSchema: healthResponseSchema })
  expect(await first).toMatchObject({ code: "network_error", success: false })
  expect(await second).toMatchObject({ code: "network_error", success: false })

  expect(await client.get({ path: "/api/health", responseSchema: healthResponseSchema })).toEqual({
    success: true,
    data: { service: "codeline", status: "ok" },
  })
  expect(fetchCount).toBe(2)
})

test("coalesced callers validate a shared response independently without schema identity hashing", async () => {
  let fetchCount = 0
  const firstSchema = v.strictObject({ service: v.string(), status: v.literal("ok") })
  const secondSchema = v.strictObject({ service: v.string(), status: v.literal("other") })
  const client = apiHttpClientCreate({
    fetch: async () => {
      fetchCount += 1
      return Response.json({ service: "codeline", status: "ok" })
    },
  })

  const [first, second] = await Promise.all([
    client.get({ path: "/api/health", responseSchema: firstSchema }),
    client.get({ path: "/api/health", responseSchema: secondSchema }),
  ])

  expect(first).toEqual({ success: true, data: { service: "codeline", status: "ok" } })
  expect(second).toMatchObject({ code: "invalid_response", success: false })
  expect(fetchCount).toBe(1)
})
