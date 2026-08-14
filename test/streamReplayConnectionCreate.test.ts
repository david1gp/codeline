import { expect, test } from "bun:test"
import { streamReplayConnectionCreate } from "../src/stream/client/streamReplayConnectionCreate.js"

function sseEvent(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function streamResponse(text: string): Response {
  return new Response(text, { headers: { "content-type": "text/event-stream" } })
}

function chunk(type: string, fields: Record<string, unknown> = {}) {
  return { ...fields, type }
}

test("recovers only persisted events after the delivered live prefix", async () => {
  const requests: Array<{ method: string; url: string }> = []
  const requestBodies: unknown[] = []
  const statuses: string[] = []
  let postCount = 0
  const connection = streamReplayConnectionCreate({
    fetcher: async (input, init) => {
      const url = input.toString()
      const method = init?.method ?? "GET"
      requests.push({ method, url })
      if (method === "POST") {
        requestBodies.push(JSON.parse(String(init?.body)))
        postCount += 1
        return postCount === 1
          ? streamResponse(sseEvent("event-1", "RUN_STARTED", chunk("RUN_STARTED", { runId: "run-1" })))
          : streamResponse("")
      }
      return streamResponse(
        `${sseEvent("event-1", "RUN_STARTED", chunk("RUN_STARTED", { runId: "run-1" }))}${sseEvent(
          "event-2",
          "TEXT_MESSAGE_CONTENT",
          chunk("TEXT_MESSAGE_CONTENT", { delta: "recovered" }),
        )}${sseEvent("event-3", "RUN_FINISHED", chunk("RUN_FINISHED"))}`,
      )
    },
    onStateChange: (status) => statuses.push(status),
    sessionId: "session/one",
  })

  const events = []
  for await (const event of connection.connect(
    [],
    { codelineExecution: { model: "selected-model", provider: "deterministic" } },
    undefined,
    { runId: "run-1", threadId: "session/one" },
  )) {
    events.push(event)
  }

  expect(events.map((event) => event.type as string)).toEqual(["RUN_STARTED", "TEXT_MESSAGE_CONTENT", "RUN_FINISHED"])
  expect(requests.filter((request) => request.method === "POST")).toHaveLength(1)
  expect(requests.at(-1)).toEqual({
    method: "GET",
    url: "/api/sessions/session%2Fone/streams/session-chat%3Asession%2Fone%3Arun-1/events",
  })
  expect(requestBodies[0]).toMatchObject({
    forwardedProps: { codelineExecution: { model: "selected-model", provider: "deterministic" } },
  })
  expect(statuses).toEqual(["streaming", "recovering", "terminal"])
})

test("surfaces stale replay as an accessible terminal error event", async () => {
  const statuses: string[] = []
  const connection = streamReplayConnectionCreate({
    fetcher: async (_input, init) => {
      if (init?.method === "POST") throw new Error("connection dropped")
      return new Response(JSON.stringify({ error: { code: "stream_stale", message: "The stream is stale." } }), {
        status: 409,
      })
    },
    onStateChange: (status) => statuses.push(status),
    sessionId: "session",
  })

  const events = []
  for await (const event of connection.connect([], {}, undefined, { runId: "run", threadId: "session" })) {
    events.push(event)
  }

  expect(events).toEqual([
    expect.objectContaining({ code: "stream_stale", message: "The stream is stale.", type: "RUN_ERROR" }),
  ])
  expect(statuses).toEqual(["streaming", "recovering", "stale"])
})

test("does not start replay after stop aborts the live connection", async () => {
  const controller = new AbortController()
  const requests: string[] = []
  const connection = streamReplayConnectionCreate({
    fetcher: async (input, init) => {
      requests.push(`${init?.method ?? "GET"} ${input.toString()}`)
      return new Response(
        new ReadableStream<Uint8Array>({
          start: (streamController) => {
            init?.signal?.addEventListener("abort", () => streamController.close(), { once: true })
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )
    },
    sessionId: "session",
  })

  const iterator = connection
    .connect([], {}, controller.signal, { runId: "run", threadId: "session" })
    [Symbol.asyncIterator]()
  const next = iterator.next()
  controller.abort()
  await expect(next).resolves.toMatchObject({ done: true })
  expect(requests).toEqual(["POST /api/sessions/session/chat"])
})
