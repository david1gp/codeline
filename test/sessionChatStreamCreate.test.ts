import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { EventType, type StreamChunk } from "@tanstack/ai"
import { sessionChatStreamCreate } from "../src/session/actions/sessionChatStreamCreate.js"

function streamOptionsCreate(
  adapter: (input: { signal: AbortSignal }) => AsyncIterable<StreamChunk>,
  onTerminal: (terminal: { executionEvidence: string; status: string }) => Promise<void>,
) {
  return {
    adapter: ((input: { signal: AbortSignal }) => adapter(input)) as never,
    database: {} as never,
    history: [],
    onTerminal,
    prompt: "Read the workspace.",
    providerOutput: {
      append: async () => createResult(undefined),
      flush: async () => createResult(undefined),
    },
    requestId: "request-1",
    runId: "run-1",
    sessionId: "session-1",
    signal: new AbortController().signal,
    userId: "user-1",
  }
}

test("top-level stream records a completed normalized tool result as retry safety evidence", async () => {
  const terminals: Array<{ executionEvidence: string; status: string }> = []
  const stream = sessionChatStreamCreate(
    streamOptionsCreate(
      async function* () {
        yield { delta: "partial", messageId: "message-1", timestamp: 1, type: EventType.TEXT_MESSAGE_CONTENT }
        yield {
          timestamp: 2,
          toolCallId: "tool-1",
          toolCallName: "read",
          toolName: "read",
          type: EventType.TOOL_CALL_START,
        }
        yield {
          content: "done",
          messageId: "message-1",
          state: "output-available",
          timestamp: 3,
          toolCallId: "tool-1",
          type: EventType.TOOL_CALL_RESULT,
        }
        yield {
          code: "provider_timeout",
          message: "The provider timed out.",
          timestamp: 4,
          type: EventType.RUN_ERROR,
        }
      },
      async (terminal) => {
        terminals.push(terminal)
      },
    ),
  )

  for await (const _chunk of stream);

  expect(terminals).toEqual([expect.objectContaining({ executionEvidence: "tool_result", status: "failed" })])
})

test("top-level stream keeps a partial-text failure retryable before a tool result", async () => {
  const terminals: Array<{ executionEvidence: string; status: string }> = []
  const stream = sessionChatStreamCreate(
    streamOptionsCreate(
      async function* () {
        yield { delta: "partial", messageId: "message-1", timestamp: 1, type: EventType.TEXT_MESSAGE_CONTENT }
        throw new Error("The provider disconnected.")
      },
      async (terminal) => {
        terminals.push(terminal)
      },
    ),
  )

  for await (const _chunk of stream);

  expect(terminals).toEqual([expect.objectContaining({ executionEvidence: "none", status: "failed" })])
})
