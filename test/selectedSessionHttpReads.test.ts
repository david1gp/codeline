import { expect, test } from "bun:test"
import { sessionDelegationsFetch } from "../src/run/ui/sessionDelegationsFetch.js"
import { sessionDetailFetch } from "../src/session/ui/sessionDetailFetch.js"
import { sessionPinRequest } from "../src/session/ui/sessionPinRequest.js"
import { sessionRenameRequest } from "../src/session/ui/sessionRenameRequest.js"

const sessionShell = (overrides: Record<string, unknown> = {}) => ({
  archivedAt: null,
  createdAt: "2026-08-23T10:00:00.000Z",
  id: "session-1",
  metadata: null,
  parentSessionId: null,
  pinned: false,
  primaryAgentId: "agent-1",
  projectPath: "/tmp/project",
  revision: 4,
  serverId: "server-1",
  title: "A session",
  updatedAt: "2026-08-23T10:05:00.000Z",
  ...overrides,
})

const sessionDetail = (overrides: Record<string, unknown> = {}) => ({
  agent: { id: "agent-1" },
  etag: '"session-1:4"',
  revision: 4,
  schemaVersion: "session.v1",
  server: { id: "server-1" },
  session: sessionShell(),
  ...overrides,
})

test("session detail read parses the typed representation with its revision and ETag", async () => {
  const requests: string[] = []
  const result = await sessionDetailFetch("session/1", {
    fetch: async (input) => {
      requests.push(String(input))
      return Response.json(sessionDetail())
    },
  })

  expect(requests).toEqual(["/api/sessions/session%2F1"])
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.session.title).toBe("A session")
  expect(result.data.revision).toBe(4)
  expect(result.data.etag).toBe('"session-1:4"')
})

test("session detail read surfaces structured API errors instead of throwing", async () => {
  const result = await sessionDetailFetch("session-1", {
    fetch: async () =>
      Response.json(
        { error: { code: "not_found", message: "The requested resource was not found." } },
        { status: 404 },
      ),
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toBe("The requested resource was not found.")
})

test("session delegation read uses the typed endpoint and preserves server order", async () => {
  const requests: string[] = []
  const result = await sessionDelegationsFetch("session/1", {
    fetch: async (input) => {
      requests.push(String(input))
      return Response.json({
        delegations: [
          {
            childSessionId: null,
            childRunId: "child-2",
            delegationId: "delegation-2",
            delegationKey: "task-2",
            finalizedResult: { status: "succeeded", text: "completed" },
            id: "delegation-2",
            parentAttemptId: "attempt-1",
            parentRunId: "run-1",
            parentSessionId: "session/1",
            task: "second task",
          },
          {
            childSessionId: null,
            childRunId: "child-1",
            delegationId: "delegation-1",
            delegationKey: "task-1",
            finalizedResult: null,
            id: "delegation-1",
            parentAttemptId: "attempt-1",
            parentRunId: "run-1",
            parentSessionId: "session/1",
            task: "first task",
          },
        ],
        etag: '"delegations:4"',
        revision: 4,
        schemaVersion: "run-delegations.v1",
      })
    },
  })

  expect(requests).toEqual(["/api/sessions/session%2F1/delegations"])
  expect(result.success).toBe(true)
  if (!result.success) return
  if (result.data.status === 304) return
  expect(result.data.data.delegations.map((delegation) => delegation.id)).toEqual(["delegation-2", "delegation-1"])
  expect(result.data.data.delegations[0]?.finalizedResult).toEqual({ status: "succeeded", text: "completed" })
  expect(result.data.revision).toBe(4)
})

test("session delegation read sends a cached ETag and preserves a typed 304 result", async () => {
  const seen: Array<{ headers: Headers; url: string }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ headers: new Headers(init?.headers), url: String(input) })
    if (seen.length === 1)
      return Response.json(
        { delegations: [], etag: '"delegations:1"', revision: 1, schemaVersion: "run-delegations.v1" },
        { headers: { ETag: '"delegations:1"' } },
      )
    return new Response(null, { headers: { ETag: '"delegations:1"' }, status: 304 })
  }

  const first = await sessionDelegationsFetch("session-1", { fetch })
  expect(first.success).toBe(true)
  if (!first.success) return
  if (first.data.status === 304) return
  const second = await sessionDelegationsFetch("session-1", {
    cached: { etag: first.data.etag },
    fetch,
  })

  expect(seen[0]?.url).toBe("/api/sessions/session-1/delegations")
  expect(seen[0]?.headers.get("If-None-Match")).toBeNull()
  expect(seen[1]?.headers.get("If-None-Match")).toBe('"delegations:1"')
  expect(second).toEqual({ success: true, data: { status: 304 } })
})

test("selected-session state uses bounded history while retaining delegation reconciliation", async () => {
  const source = await Bun.file(new URL("../src/ui/selectedSessionStateCreate.ts", import.meta.url)).text()

  expect(source).toContain("sessionBoundedHistoryStateCreate")
  expect(source).toContain("sessionDelegationsFetch")
  expect(source).toContain("httpQueryStateCreate")
  expect(source).not.toContain("sessionFinalizedMessagesFetch")
  expect(source).not.toContain("sessionActiveRunReattachStateCreate")
})

test("session delegation read rejects an empty session identifier without fetching", async () => {
  let called = false
  const result = await sessionDelegationsFetch(" ", {
    fetch: async () => {
      called = true
      return Response.json({ delegations: [] })
    },
  })

  expect(called).toBe(false)
  expect(result.success).toBe(false)
})

test("session rename sends the concurrency ETag as If-Match", async () => {
  const seen: Array<{ body: string | undefined; headers: Headers; method: string | undefined }> = []
  const result = await sessionRenameRequest("session-1", "Renamed", {
    etag: '"session-1:4"',
    fetch: async (_input, init) => {
      seen.push({ body: init?.body?.toString(), headers: new Headers(init?.headers), method: init?.method })
      return Response.json(sessionDetail({ revision: 5, session: sessionShell({ revision: 5, title: "Renamed" }) }))
    },
  })

  expect(seen[0]?.method).toBe("PATCH")
  expect(seen[0]?.headers.get("If-Match")).toBe('"session-1:4"')
  expect(seen[0]?.body).toBe(JSON.stringify({ title: "Renamed" }))
  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.session.title).toBe("Renamed")
})

test("session rename refuses to send a request without a known ETag", async () => {
  let called = false
  const result = await sessionRenameRequest("session-1", "Renamed", {
    etag: "",
    fetch: async () => {
      called = true
      return Response.json(sessionDetail())
    },
  })

  expect(called).toBe(false)
  expect(result.success).toBe(false)
})

test("session pin sends the concurrency ETag and reports precondition failures", async () => {
  const seen: Array<{ body: string | undefined; headers: Headers; url: string }> = []
  const ok = await sessionPinRequest("session-1", true, {
    etag: '"session-1:4"',
    fetch: async (input, init) => {
      seen.push({ body: init?.body?.toString(), headers: new Headers(init?.headers), url: String(input) })
      return Response.json(sessionDetail({ revision: 5, session: sessionShell({ pinned: true, revision: 5 }) }))
    },
  })

  expect(seen[0]?.url).toBe("/api/sessions/session-1/pin")
  expect(seen[0]?.headers.get("If-Match")).toBe('"session-1:4"')
  expect(seen[0]?.body).toBe(JSON.stringify({ pinned: true }))
  expect(ok.success).toBe(true)
  if (ok.success) expect(ok.data.session.pinned).toBe(true)

  const conflict = await sessionPinRequest("session-1", true, {
    etag: '"session-1:stale"',
    fetch: async () =>
      Response.json(
        {
          error: {
            code: "precondition_failed",
            currentEtag: '"session-1:5"',
            currentRevision: 5,
            message: "The session changed before it could be pinned.",
            op: "sessionPin",
            retryable: false,
            status: 412,
          },
        },
        { status: 412 },
      ),
  })

  expect(conflict.success).toBe(false)
  if (conflict.success) return
  expect(conflict.errorMessage).toBe("The session changed before it could be pinned.")
})
