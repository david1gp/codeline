import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type ProviderExecutionEvent,
  providerExecutionEventSchema,
} from "../../providers/schema/providerExecutionEventSchema.js"
import { type ExecutionStreamEvent, executionStreamEventSchema } from "../schema/executionStreamEventSchema.js"
import { executionToolPayloadBound } from "./executionToolPayloadBound.js"

function executionStringRedact(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|gh[pousr])[-_][A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/(https?:\/\/[^\s/:@]+:)[^\s/@]+@/gi, "$1[REDACTED]@")
}

function executionStreamEventParse(input: unknown): Result<ExecutionStreamEvent> {
  const op = "executionStreamEventNormalize"
  const parsed = v.safeParse(executionStreamEventSchema, input)
  if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
  return createResult(parsed.output)
}

export function executionStreamEventNormalize(input: unknown): Result<ExecutionStreamEvent> {
  const op = "executionStreamEventNormalize"
  const providerEvent = v.safeParse(providerExecutionEventSchema, input)
  if (!providerEvent.success) return createResultError(op, v.summarize(providerEvent.issues))
  const event: ProviderExecutionEvent = providerEvent.output

  if (event.type === "text_delta") {
    return executionStreamEventParse({
      eventType: event.type,
      payload: { delta: executionStringRedact(event.delta) },
    })
  }
  if (event.type === "thinking_status") {
    return executionStreamEventParse({ eventType: event.type, payload: { status: event.status } })
  }
  if (event.type === "tool_start") {
    return executionStreamEventParse({
      eventType: event.type,
      payload: { toolCallId: event.toolCallId, toolName: event.toolName },
    })
  }
  if (event.type === "tool_output") {
    const output = executionToolPayloadBound(event.output)
    return executionStreamEventParse({
      eventType: event.type,
      payload: {
        output: output.content,
        toolCallId: event.toolCallId,
        truncated: output.truncated,
      },
    })
  }
  if (event.type === "tool_result") {
    const result = executionToolPayloadBound(event.result)
    return executionStreamEventParse({
      eventType: event.type,
      payload: {
        outcome: event.outcome,
        result: result.content,
        toolCallId: event.toolCallId,
        truncated: result.truncated,
        ...(event.workingDirectory === undefined ? {} : { workingDirectory: event.workingDirectory }),
      },
    })
  }
  if (event.type === "written_file") {
    return executionStreamEventParse({ eventType: event.type, payload: { path: event.path } })
  }

  return executionStreamEventParse({
    eventType: event.type,
    payload: {
      ...(event.code === undefined ? {} : { code: event.code }),
      ...(event.message === undefined ? {} : { message: executionStringRedact(event.message).slice(0, 4_096) }),
      status: event.status,
    },
  })
}
