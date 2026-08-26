import { expect, test } from "bun:test"
import { sessionChatConnectionCreate } from "../src/ui/sessionChatConnectionCreate.js"

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  })
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
