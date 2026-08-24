import { expect, test } from "bun:test"
import { runCancelCommand } from "../src/run/client/runCancelCommand.js"

test("run cancellation command posts the public client run ID and parses success", async () => {
  const requests: Array<{ body: string | undefined; method: string | undefined; url: string }> = []
  const result = await runCancelCommand({
    clientRunId: "client/run",
    fetcher: async (input, init) => {
      requests.push({ body: init?.body?.toString(), method: init?.method, url: String(input) })
      return Response.json({ cancelledRunIds: ["durable-run"], signalledRunIds: ["durable-run"] })
    },
    sessionId: "session/1",
  })

  expect(result).toEqual({
    success: true,
    data: { cancelledRunIds: ["durable-run"], signalledRunIds: ["durable-run"] },
  })
  expect(requests).toEqual([
    {
      body: '{"kind":"requested"}',
      method: "POST",
      url: "/api/sessions/session%2F1/runs/client%2Frun/cancel",
    },
  ])
})

test("run cancellation command returns the API error without throwing", async () => {
  const result = await runCancelCommand({
    clientRunId: "client-run",
    fetcher: async () =>
      Response.json({ error: { code: "conflict", message: "The session is archived." } }, { status: 409 }),
    sessionId: "session-1",
  })

  expect(result).toMatchObject({
    code: "conflict",
    errorMessage: "The session is archived.",
    op: "runCancelCommand",
    success: false,
  })
})

test("run cancellation command rejects an invalid typed response", async () => {
  const result = await runCancelCommand({
    clientRunId: "client-run",
    fetcher: async () => Response.json({ cancelledRunIds: ["durable-run"] }),
    sessionId: "session-1",
  })

  expect(result).toMatchObject({ code: "invalid_response", op: "runCancelCommand", success: false })
})
