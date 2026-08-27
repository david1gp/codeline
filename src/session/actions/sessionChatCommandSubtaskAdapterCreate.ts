import { createHash } from "node:crypto"
import { EventType, type StreamChunk } from "@tanstack/ai"
import type { CodelineExecution } from "../../providers/schema/codelineExecutionSchema.js"
import type { sessionChatAdapterCreate } from "./sessionChatAdapterCreate.js"

type SessionChatCommandSubtaskAdapterCreateOptions = {
  agentId?: string
  execute: (input: {
    agentId?: string
    execution?: unknown
    signal: AbortSignal
    task: string
    toolCallId: string
  }) => Promise<string>
  execution?: CodelineExecution
}

function commandSubtaskDelegationKeyCreate(runId: string): string {
  const direct = `command-subtask:${runId}`
  if (direct.length <= 200) return direct
  return `command-subtask:${createHash("sha256").update(runId).digest("hex")}`
}

export function sessionChatCommandSubtaskAdapterCreate(
  options: SessionChatCommandSubtaskAdapterCreateOptions,
): typeof sessionChatAdapterCreate {
  return (input) => sessionChatCommandSubtaskAdapterGenerate(options, input)
}

async function* sessionChatCommandSubtaskAdapterGenerate(
  options: SessionChatCommandSubtaskAdapterCreateOptions,
  input: Parameters<typeof sessionChatAdapterCreate>[0],
): AsyncGenerator<StreamChunk> {
  if (input.signal.aborted) return

  const messageId = `assistant-${input.runId}`
  yield {
    runId: input.runId,
    threadId: input.sessionId,
    timestamp: Date.now(),
    type: EventType.RUN_STARTED,
  }

  let text: string
  try {
    text = await options.execute({
      ...(options.agentId === undefined ? {} : { agentId: options.agentId }),
      ...(options.execution === undefined ? {} : { execution: options.execution }),
      signal: input.signal,
      task: input.prompt,
      toolCallId: commandSubtaskDelegationKeyCreate(input.runId),
    })
  } catch (error) {
    if (input.signal.aborted) return
    yield {
      code: "provider_failed",
      message: error instanceof Error ? error.message : "The delegated task failed.",
      timestamp: Date.now(),
      type: EventType.RUN_ERROR,
    }
    return
  }
  if (input.signal.aborted) return

  yield {
    messageId,
    role: "assistant",
    timestamp: Date.now(),
    type: EventType.TEXT_MESSAGE_START,
  }
  if (text.length > 0)
    yield {
      delta: text,
      messageId,
      timestamp: Date.now(),
      type: EventType.TEXT_MESSAGE_CONTENT,
    }
  yield {
    messageId,
    timestamp: Date.now(),
    type: EventType.TEXT_MESSAGE_END,
  }
  yield {
    finishReason: "stop",
    outcome: { type: "success" },
    runId: input.runId,
    threadId: input.sessionId,
    timestamp: Date.now(),
    type: EventType.RUN_FINISHED,
  }
}
