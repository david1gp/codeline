import { expect, test } from "bun:test"
import { streamReplayClientCreate } from "../src/stream/client/streamReplayClientCreate.js"

function sseEvent(id: string, event: string, data: unknown): string {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

test("replays ordered events after a known cursor, deduplicates sequences, and terminalizes", async () => {
  const requests: string[] = []
  const responses = [
    new Response(
      `${sseEvent("event-1", "text_delta", { delta: "one" })}${sseEvent("event-2", "text_delta", { delta: "two" })}`,
      {
        headers: { "content-type": "text/event-stream" },
      },
    ),
    new Response(
      `${sseEvent("event-2", "text_delta", { delta: "two" })}${sseEvent("event-3", "terminal", { status: "completed" })}`,
      { headers: { "content-type": "text/event-stream" } },
    ),
  ]
  const client = streamReplayClientCreate({
    fetcher: async (input) => {
      requests.push(input.toString())
      const response = responses.shift()
      if (response === undefined) throw new Error("Unexpected request")
      return response
    },
    sessionId: "session/one",
    streamId: "stream:one",
  })

  const first = await client.replay()
  expect(first).toMatchObject({
    success: true,
    data: {
      events: [
        { eventType: "text_delta", id: "event-1", sequence: 1 },
        { eventType: "text_delta", id: "event-2", sequence: 2 },
      ],
      lastEventId: "event-2",
      lastSequence: 2,
      outcome: "active",
    },
  })

  const second = await client.replay({ afterSequence: 1 })
  expect(second).toMatchObject({
    success: true,
    data: {
      events: [{ eventType: "terminal", id: "event-3", sequence: 3 }],
      lastEventId: "event-3",
      lastSequence: 3,
      outcome: "terminal",
      terminalEvent: { id: "event-3", sequence: 3 },
    },
  })
  expect(requests).toEqual([
    "/api/sessions/session%2Fone/streams/stream%3Aone/events",
    "/api/sessions/session%2Fone/streams/stream%3Aone/events?afterEventId=event-1",
  ])

  const repeated = await client.replay()
  expect(repeated).toMatchObject({ success: true, data: { events: [], outcome: "terminal" } })
  expect(requests).toHaveLength(2)
})

test("uses the sequence paired with an explicit known event cursor", async () => {
  const requests: string[] = []
  const client = streamReplayClientCreate({
    fetcher: async (input) => {
      requests.push(input.toString())
      return new Response(sseEvent("event-1", "text_delta", { delta: "one" }))
    },
    sessionId: "session",
    streamId: "stream",
  })

  await client.replay()
  const result = await client.replay({ afterEventId: "event-1" })
  expect(result).toMatchObject({ success: true, data: { events: [] } })
  expect(requests[1]).toBe("/api/sessions/session/streams/stream/events?afterEventId=event-1")
})

test("rejects an event cursor paired with a conflicting known sequence", async () => {
  const client = streamReplayClientCreate({
    fetcher: async () => new Response(sseEvent("event-1", "text_delta", { delta: "one" })),
    sessionId: "session",
    streamId: "stream",
  })

  expect((await client.replay()).success).toBe(true)
  expect(await client.replay({ afterEventId: "event-1", afterSequence: 2 })).toMatchObject({
    errorMessage: "The stream event cursor does not match its known sequence.",
    success: false,
  })
})

test("filters a replay after a known sequence when no event cursor is available", async () => {
  let requestUrl = ""
  const client = streamReplayClientCreate({
    afterSequence: 1,
    fetcher: async (input) => {
      requestUrl = input.toString()
      return new Response(
        `${sseEvent("event-1", "text_delta", { delta: "old" })}${sseEvent("event-2", "terminal", { status: "error" })}`,
      )
    },
    sessionId: "session",
    streamId: "stream",
  })

  const result = await client.replay()
  expect(result).toMatchObject({
    success: true,
    data: {
      events: [{ eventType: "terminal", id: "event-2", sequence: 2 }],
      lastSequence: 2,
      outcome: "terminal",
    },
  })
  expect(requestUrl).toBe("/api/sessions/session/streams/stream/events")
})

test("exposes stale and transport errors without throwing", async () => {
  const staleClient = streamReplayClientCreate({
    fetcher: async () =>
      new Response(JSON.stringify({ error: { code: "stream_stale", message: "The stream is stale." } }), {
        status: 409,
      }),
    sessionId: "session",
    streamId: "stream",
  })
  const stale = await staleClient.replay()
  expect(stale).toMatchObject({
    code: "stream_stale",
    statusCode: 409,
    success: false,
  })

  const errorClient = streamReplayClientCreate({
    fetcher: async () => {
      throw new Error("offline")
    },
    sessionId: "session",
    streamId: "stream",
  })
  const error = await errorClient.replay()
  expect(error).toMatchObject({ code: "stream_replay_error", success: false })
})

test("does not invent an absolute sequence for an unpaired event cursor", async () => {
  const client = streamReplayClientCreate({
    afterEventId: "event-2",
    fetcher: async () => new Response(""),
    sessionId: "session",
    streamId: "stream",
  })

  expect(await client.replay()).toMatchObject({
    errorMessage: "The stream event cursor requires a known sequence.",
    success: false,
  })
})
