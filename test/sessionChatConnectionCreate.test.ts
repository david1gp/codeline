import { expect, test } from "bun:test"
import { sessionChatConnectionCreate } from "../src/ui/sessionChatConnectionCreate.js"

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  })
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
}

function deferredCreate<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

async function connectionChunksLoad(snapshot: unknown) {
  const connection = sessionChatConnectionCreate({
    fetcher: async (input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      expect(String(input)).toBe("/api/sessions/session-1/runs/run-1/snapshot")
      return response(snapshot)
    },
    sessionId: "session-1",
  })
  const chunks = []
  for await (const chunk of connection.connect(
    [{ content: "hello", id: "message-1", role: "user" }],
    undefined,
    undefined,
    { runId: "run-1", threadId: "session-1" },
  ))
    chunks.push(chunk)
  return chunks
}

test("chat connection reports authoritative durable failure metadata", async () => {
  const chunks = await connectionChunksLoad({
    failure: { code: "provider_timeout", message: "The provider timed out." },
    lastSequence: 4,
    partialText: "",
    status: "failed",
  })

  expect(chunks).toHaveLength(1)
  expect(chunks[0]).toMatchObject({
    code: "provider_timeout",
    message: "The provider timed out.",
    type: "RUN_ERROR",
  })
})

test("chat connection keeps the generic terminal failure fallback without metadata", async () => {
  const chunks = await connectionChunksLoad({ lastSequence: 4, partialText: "", status: "failed" })

  expect(chunks).toHaveLength(1)
  expect(chunks[0]).toMatchObject({
    code: "run_failed",
    message: "The chat run did not complete successfully.",
    type: "RUN_ERROR",
  })
})

async function connectionRequestBodyRead(command?: () => { arguments: string; name: string } | undefined) {
  let body: unknown
  const connection = sessionChatConnectionCreate({
    ...(command === undefined ? {} : { command }),
    fetcher: async (_input, init) => {
      if (init?.method === "POST") {
        body = JSON.parse(String(init.body))
        return response({ runId: "run-1", sessionId: "session-1" })
      }
      return response({ lastSequence: 1, partialText: "", status: "succeeded" })
    },
    sessionId: "session-1",
  })
  for await (const _chunk of connection.connect(
    [{ content: "/review alpha", id: "message-1", role: "user" }],
    undefined,
    undefined,
    { runId: "run-1", threadId: "session-1" },
  ));
  return body as Record<string, unknown>
}

test("an existing-session turn sends only the typed command identity, never an expansion", async () => {
  const body = await connectionRequestBodyRead(() => ({ arguments: 'alpha "beta gamma"', name: "review" }))

  expect(body.command).toEqual({ arguments: 'alpha "beta gamma"', name: "review" })
  expect(body.runId).toBe("run-1")
  expect(body.threadId).toBe("session-1")
  // Expansion, interpolation, and digests stay server-owned.
  expect(Object.keys(body)).not.toContain("expandedText")
  expect(Object.keys(body)).not.toContain("templateDigest")
})

test("a prose turn omits the command field entirely", async () => {
  expect(await connectionRequestBodyRead()).not.toHaveProperty("command")
  expect(await connectionRequestBodyRead(() => undefined)).not.toHaveProperty("command")
})

test("aborting while a snapshot fetch is pending terminates without completion or another poll", async () => {
  const controller = new AbortController()
  const states: string[] = []
  let snapshotRequests = 0
  const snapshotFetchEntered = deferredCreate<void>()
  const pendingSnapshot = deferredCreate<Response>()
  const connection = sessionChatConnectionCreate({
    fetcher: async (input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      expect(String(input)).toBe("/api/sessions/session-1/runs/run-1/snapshot")
      snapshotRequests += 1
      snapshotFetchEntered.resolve(undefined)
      return pendingSnapshot.promise
    },
    onStateChange: (status) => states.push(status),
    sessionId: "session-1",
  })
  const iterator = connection
    .connect([{ content: "hello", id: "message-1", role: "user" }], undefined, controller.signal, {
      runId: "run-1",
      threadId: "session-1",
    })
    [Symbol.asyncIterator]()
  const pendingResult = iterator.next()
  await snapshotFetchEntered.promise
  expect(snapshotRequests).toBe(1)

  controller.abort()
  const result = await pendingResult
  expect(result).toBeDefined()
  expect(result.done).toBe(true)
  expect(states).toEqual(["streaming"])

  pendingSnapshot.resolve(response({ lastSequence: 1, partialText: "late", status: "succeeded" }))
  await iterator.next()
  expect(snapshotRequests).toBe(1)
})

test("aborting during the inter-poll delay terminates without completion or another poll", async () => {
  const controller = new AbortController()
  const states: string[] = []
  let snapshotRequests = 0
  const pollingDelayEntered = deferredCreate<void>()
  const pollingDelayReleased = deferredCreate<void>()
  const connection = sessionChatConnectionCreate({
    fetcher: async (input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      expect(String(input)).toBe("/api/sessions/session-1/runs/run-1/snapshot")
      snapshotRequests += 1
      return response({ lastSequence: 1, partialText: "", status: "running" })
    },
    onStateChange: (status) => states.push(status),
    pollingDelay: (signal) => {
      pollingDelayEntered.resolve(undefined)
      signal?.addEventListener("abort", () => pollingDelayReleased.resolve(undefined), { once: true })
      return pollingDelayReleased.promise
    },
    sessionId: "session-1",
  })
  const iterator = connection
    .connect([{ content: "hello", id: "message-1", role: "user" }], undefined, controller.signal, {
      runId: "run-1",
      threadId: "session-1",
    })
    [Symbol.asyncIterator]()
  const pendingResult = iterator.next()
  await pollingDelayEntered.promise
  expect(snapshotRequests).toBe(1)

  controller.abort()
  const result = await pendingResult
  expect(result).toBeDefined()
  expect(result.done).toBe(true)
  expect(states).toEqual(["streaming"])

  expect(snapshotRequests).toBe(1)
})
