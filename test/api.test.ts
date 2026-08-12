import { expect, test } from "bun:test"
import { toServerSentEventsStream } from "@tanstack/ai"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { healthResponseSchema } from "../src/api/health/healthResponseSchema.js"
import { testingEchoResponseSchema } from "../src/api/testing/testingEchoResponseSchema.js"
import { testingStreamCreate } from "../src/api/testing/testingStreamCreate.js"
import { appCreate } from "../src/app/appCreate.js"

const app = appCreate()

test("health endpoint returns its validated response", async () => {
  const response = await app.request("http://codeline.test/health")
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(v.safeParse(healthResponseSchema, body).success).toBe(true)
})

test("API health endpoint returns its validated response", async () => {
  const response = await app.request("http://codeline.test/api/health")
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(v.safeParse(healthResponseSchema, body).success).toBe(true)
})

test("echo endpoint validates requests and returns its validated response", async () => {
  const response = await app.request("http://codeline.test/api/testing/echo", {
    body: JSON.stringify({ message: "hello" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(v.safeParse(testingEchoResponseSchema, body).success).toBe(true)
  expect(body).toEqual({ message: "hello" })
})

test("echo endpoint rejects an invalid request with a validated error response", async () => {
  const response = await app.request("http://codeline.test/api/testing/echo", {
    body: JSON.stringify({ message: "" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const body = await response.json()

  expect(response.status).toBe(400)
  expect(v.safeParse(apiErrorResponseSchema, body).success).toBe(true)
  expect(body.error.code).toBe("bad_request")
})

test("API error seams return deterministic validated responses", async () => {
  const requests = [
    ["http://codeline.test/api/testing/errors/bad-request", 400, "bad_request"],
    ["http://codeline.test/api/testing/errors/internal-server-error", 500, "internal_server_error"],
    ["http://codeline.test/api/testing/unknown", 404, "not_found"],
  ] as const

  for (const [url, status, code] of requests) {
    const response = await app.request(url)
    const body = await response.json()

    expect(response.status).toBe(status)
    expect(v.safeParse(apiErrorResponseSchema, body).success).toBe(true)
    expect(body.error.code).toBe(code)
  }
})

async function streamEvents(
  url: string,
  signal?: AbortSignal,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const response = await app.request(url, { signal })
  expect(response.status).toBe(200)
  expect(response.headers.get("Content-Type")).toContain("text/event-stream")

  const text = await response.text()
  return text
    .trim()
    .split("\n\n")
    .map((event) => {
      const lines = event.split("\n")
      const id = lines.find((line) => line.startsWith("id: "))?.slice(4)
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6)
      if (id === undefined || data === undefined) throw new Error("Invalid SSE event")
      return { data: JSON.parse(data) as Record<string, unknown>, id }
    })
}

test("stream endpoint returns deterministic TanStack AI SSE events with IDs", async () => {
  const events = await streamEvents("http://codeline.test/api/testing/stream?scenario=normal")

  expect(events.map((event) => event.id)).toEqual(["1", "2", "3", "4"])
  expect(events.map((event) => event.data.type)).toEqual([
    "RUN_STARTED",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_CONTENT",
    "RUN_FINISHED",
  ])
})

test("stream endpoint exposes mid-stream errors as terminal TanStack AI events", async () => {
  const events = await streamEvents("http://codeline.test/api/testing/stream?scenario=error")

  expect(events.at(-1)?.data).toMatchObject({ code: "stream_test_error", type: "RUN_ERROR" })
})

test("stream endpoint preserves an unexpected end without fabricating completion", async () => {
  const events = await streamEvents("http://codeline.test/api/testing/stream?scenario=unexpected-end")

  expect(events.at(-1)?.data.type).toBe("TEXT_MESSAGE_CONTENT")
})

test("stream endpoint returns a configurable idle timeout event", async () => {
  const events = await streamEvents("http://codeline.test/api/testing/stream?scenario=idle-timeout&idleTimeoutMs=5")

  expect(events.at(-1)?.data).toMatchObject({ code: "stream_idle_timeout", type: "RUN_ERROR" })
})

test("stream endpoint cancels its source when the consumer cancels", async () => {
  let cleanupCount = 0
  const abortController = new AbortController()
  const stream = testingStreamCreate({
    delayMs: 1000,
    idleTimeoutMs: 2000,
    scenario: "normal",
    signal: abortController.signal,
    cleanup: () => {
      cleanupCount += 1
    },
  })
  const response = new Response(toServerSentEventsStream(stream, abortController))
  const reader = response.body?.getReader()

  if (reader === undefined) throw new Error("Expected an SSE response body")
  await reader.read()
  await reader.cancel("test cancellation")
  expect(cleanupCount).toBe(1)
})

test("stream endpoint validates its query contract", async () => {
  const response = await app.request("http://codeline.test/api/testing/stream?scenario=unknown")
  const body = await response.json()

  expect(response.status).toBe(400)
  expect(v.safeParse(apiErrorResponseSchema, body).success).toBe(true)
})
