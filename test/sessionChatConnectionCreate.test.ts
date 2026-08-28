import { expect, test } from "bun:test"
import { sessionChatConnectionCreate } from "../src/ui/sessionChatConnectionCreate.js"

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
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

test("a terminal success may clear the active partial text before completion", async () => {
  const snapshots = [
    { lastSequence: 1, partialText: "hello", status: "running" },
    { lastSequence: 2, partialText: "", status: "succeeded" },
  ]
  const connection = sessionChatConnectionCreate({
    fetcher: async (_input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      return response(snapshots.shift())
    },
    pollingDelay: async () => {},
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

  expect(chunks).toHaveLength(2)
  expect(chunks[0]).toMatchObject({ delta: "hello", type: "TEXT_MESSAGE_CONTENT" })
  expect(chunks[1]).toMatchObject({ runId: "run-1", type: "RUN_FINISHED" })
})

test("terminal failures remain authoritative when finalization clears active partial text", async () => {
  for (const status of ["failed", "aborted"] as const) {
    const snapshots = [
      { lastSequence: 1, partialText: "hello", status: "running" },
      {
        failure: { code: `${status}_reason`, message: `The run was ${status}.` },
        lastSequence: 2,
        partialText: "",
        status,
      },
    ]
    const connection = sessionChatConnectionCreate({
      fetcher: async (_input, init) => {
        if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
        return response(snapshots.shift())
      },
      pollingDelay: async () => {},
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

    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ delta: "hello", type: "TEXT_MESSAGE_CONTENT" })
    expect(chunks[1]).toMatchObject({
      code: `${status}_reason`,
      message: `The run was ${status}.`,
      type: "RUN_ERROR",
    })
  }
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

test("a transient snapshot failure recovers and emits the completed response once", async () => {
  const states: string[] = []
  const delays: number[] = []
  let snapshotRequests = 0
  const connection = sessionChatConnectionCreate({
    fetcher: async (input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      expect(String(input)).toBe("/api/sessions/session-1/runs/run-1/snapshot")
      snapshotRequests += 1
      if (snapshotRequests === 1) throw new Error("network temporarily unavailable")
      return response({ lastSequence: snapshotRequests, partialText: "recovered", status: "succeeded" })
    },
    onStateChange: (status) => states.push(status),
    pollingDelay: async (_signal, milliseconds) => {
      delays.push(milliseconds)
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

  expect(chunks).toHaveLength(2)
  expect(chunks[0]).toMatchObject({ delta: "recovered", type: "TEXT_MESSAGE_CONTENT" })
  expect(chunks[1]).toMatchObject({ runId: "run-1", type: "RUN_FINISHED" })
  expect(snapshotRequests).toBe(2)
  expect(delays).toEqual([100])
  expect(states).toEqual(["streaming", "recovering", "streaming", "terminal"])
})

test("transient snapshot retries continue until caller cancellation", async () => {
  const controller = new AbortController()
  const states: string[] = []
  const delays: number[] = []
  let snapshotRequests = 0
  const retryDelayEntered = deferredCreate<void>()
  const retryDelayReleased = deferredCreate<void>()
  const connection = sessionChatConnectionCreate({
    fetcher: async (input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      expect(String(input)).toBe("/api/sessions/session-1/runs/run-1/snapshot")
      snapshotRequests += 1
      throw new Error("network temporarily unavailable")
    },
    onStateChange: (status) => states.push(status),
    pollingDelay: (signal, milliseconds) => {
      delays.push(milliseconds)
      if (delays.length < 3) return Promise.resolve()
      retryDelayEntered.resolve(undefined)
      signal?.addEventListener("abort", () => retryDelayReleased.resolve(undefined), { once: true })
      return retryDelayReleased.promise
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
  await retryDelayEntered.promise

  expect(snapshotRequests).toBe(3)
  controller.abort()
  const result = await pendingResult

  expect(result.done).toBe(true)
  expect(snapshotRequests).toBe(3)
  expect(delays).toEqual([100, 200, 400])
  expect(states).toEqual(["streaming", "recovering", "recovering", "recovering"])
})

test("temporary snapshot HTTP failures retry with capped exponential delays", async () => {
  const temporaryStatuses = [408, 425, 429, 500, 503, 599]
  const delays: number[] = []
  let snapshotRequests = 0
  const connection = sessionChatConnectionCreate({
    fetcher: async (_input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      const status = temporaryStatuses[snapshotRequests]
      snapshotRequests += 1
      if (status !== undefined)
        return response(
          { error: { code: "temporary_failure", message: "The snapshot is temporarily unavailable." } },
          status,
        )
      return response({ lastSequence: snapshotRequests, partialText: "recovered", status: "succeeded" })
    },
    pollingDelay: async (_signal, milliseconds) => {
      delays.push(milliseconds)
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

  expect(snapshotRequests).toBe(temporaryStatuses.length + 1)
  expect(delays).toEqual([100, 200, 400, 800, 1_600, 1_600])
  expect(chunks.filter((chunk) => chunk.type === "RUN_FINISHED")).toHaveLength(1)
  expect(chunks.some((chunk) => chunk.type === "RUN_ERROR")).toBe(false)
})

test("terminal snapshot failures emit one run snapshot error without retrying", async () => {
  const states: string[] = []
  const delays: number[] = []
  let snapshotRequests = 0
  const connection = sessionChatConnectionCreate({
    fetcher: async (_input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      snapshotRequests += 1
      return response({ error: { code: "run_not_found", message: "The run was not found." } }, 404)
    },
    onStateChange: (status) => states.push(status),
    pollingDelay: async (_signal, milliseconds) => {
      delays.push(milliseconds)
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

  expect(snapshotRequests).toBe(1)
  expect(delays).toEqual([])
  expect(states).toEqual(["streaming", "error"])
  expect(chunks).toEqual([
    expect.objectContaining({
      code: "run_snapshot_error",
      message: "The run was not found.",
      type: "RUN_ERROR",
    }),
  ])
})

test("completion observed after a disconnected snapshot fetch does not emit an error", async () => {
  let snapshotRequests = 0
  const connection = sessionChatConnectionCreate({
    fetcher: async (input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      expect(String(input)).toBe("/api/sessions/session-1/runs/run-1/snapshot")
      snapshotRequests += 1
      if (snapshotRequests < 3) throw new Error("disconnected")
      return response({ lastSequence: 3, partialText: "done", status: "succeeded" })
    },
    pollingDelay: async () => {},
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

  expect(chunks.filter((chunk) => chunk.type === "RUN_FINISHED")).toHaveLength(1)
  expect(chunks.some((chunk) => chunk.type === "RUN_ERROR")).toBe(false)
  expect(snapshotRequests).toBe(3)
})

test("snapshot retry backoff is capped and resets after a successful snapshot", async () => {
  const delays: number[] = []
  let snapshotRequests = 0
  const connection = sessionChatConnectionCreate({
    fetcher: async (_input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      snapshotRequests += 1
      if (snapshotRequests <= 5 || snapshotRequests === 7) throw new Error("temporary failure")
      if (snapshotRequests === 6) return response({ lastSequence: 6, partialText: "", status: "running" })
      return response({ lastSequence: 8, partialText: "", status: "succeeded" })
    },
    pollingDelay: async (_signal, milliseconds) => {
      delays.push(milliseconds)
    },
    sessionId: "session-1",
  })

  for await (const _chunk of connection.connect(
    [{ content: "hello", id: "message-1", role: "user" }],
    undefined,
    undefined,
    { runId: "run-1", threadId: "session-1" },
  ));

  expect(delays).toEqual([100, 200, 400, 800, 1_600, 100, 100])
})

test("cancellation during snapshot retry is silent and terminal", async () => {
  const controller = new AbortController()
  const states: string[] = []
  let snapshotRequests = 0
  const retryDelayEntered = deferredCreate<void>()
  const retryDelayReleased = deferredCreate<void>()
  const connection = sessionChatConnectionCreate({
    fetcher: async (input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      expect(String(input)).toBe("/api/sessions/session-1/runs/run-1/snapshot")
      snapshotRequests += 1
      throw new Error("network temporarily unavailable")
    },
    onStateChange: (status) => states.push(status),
    pollingDelay: (signal) => {
      retryDelayEntered.resolve(undefined)
      signal?.addEventListener("abort", () => retryDelayReleased.resolve(undefined), { once: true })
      return retryDelayReleased.promise
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
  await retryDelayEntered.promise

  controller.abort()
  const result = await pendingResult

  expect(result.done).toBe(true)
  expect(snapshotRequests).toBe(1)
  expect(states).toEqual(["streaming", "recovering"])
})

test("a non-prefix snapshot text emits a terminal consistency error", async () => {
  const snapshots = [
    { lastSequence: 1, partialText: "hello", status: "running" },
    { lastSequence: 2, partialText: "hello world", status: "running" },
    { lastSequence: 3, partialText: "hello there", status: "running" },
  ]
  const connection = sessionChatConnectionCreate({
    fetcher: async (_input, init) => {
      if (init?.method === "POST") return response({ runId: "run-1", sessionId: "session-1" })
      return response(snapshots.shift())
    },
    pollingDelay: async () => {},
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

  expect(chunks.filter((chunk) => chunk.type === "TEXT_MESSAGE_CONTENT").map((chunk) => chunk.delta)).toEqual([
    "hello",
    " world",
  ])
  expect(chunks).toHaveLength(3)
  expect(chunks.at(-1)).toMatchObject({
    code: "run_snapshot_error",
    message: "The active run snapshot text is not append-only.",
    type: "RUN_ERROR",
  })
})
