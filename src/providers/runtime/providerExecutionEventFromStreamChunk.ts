import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { toolResultWorkingDirectoryResolve } from "../../tools/runtime/toolResultWorkingDirectoryResolve.js"
import { type ProviderExecutionEvent, providerExecutionEventSchema } from "../schema/providerExecutionEventSchema.js"

const streamChunkTypeSchema = v.object({ type: v.string() })
const textChunkSchema = v.object({ delta: v.string(), type: v.literal("TEXT_MESSAGE_CONTENT") })
const toolStartChunkSchema = v.object({
  toolCallId: v.string(),
  toolCallName: v.optional(v.string()),
  toolName: v.optional(v.string()),
  type: v.literal("TOOL_CALL_START"),
})
const toolEndChunkSchema = v.object({
  output: v.optional(v.unknown()),
  result: v.optional(v.unknown()),
  toolCallId: v.string(),
  type: v.literal("TOOL_CALL_END"),
})
const toolResultChunkSchema = v.object({
  content: v.unknown(),
  state: v.optional(v.string()),
  toolCallId: v.string(),
  type: v.literal("TOOL_CALL_RESULT"),
  workingDirectory: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(4_096))),
})
const runErrorChunkSchema = v.object({
  code: v.optional(v.string()),
  message: v.string(),
  type: v.literal("RUN_ERROR"),
})
const runFinishedChunkSchema = v.object({ outcome: v.optional(v.unknown()), type: v.literal("RUN_FINISHED") })

function providerExecutionEventParse(input: unknown): Result<ProviderExecutionEvent> {
  const op = "providerExecutionEventFromStreamChunk"
  const parsed = v.safeParse(providerExecutionEventSchema, input)
  if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
  return createResult(parsed.output)
}

function providerExecutionEventTerminalStatus(outcome: unknown): "aborted" | "completed" | "error" {
  if (typeof outcome !== "object" || outcome === null || !("type" in outcome)) return "completed"
  if (outcome.type === "success") return "completed"
  if (
    outcome.type === "interrupt" ||
    outcome.type === "interrupted" ||
    outcome.type === "cancelled" ||
    outcome.type === "canceled"
  ) {
    return "aborted"
  }
  return "error"
}

export function providerExecutionEventFromStreamChunk(input: unknown): Result<ProviderExecutionEvent | null> {
  const op = "providerExecutionEventFromStreamChunk"
  const direct = v.safeParse(providerExecutionEventSchema, input)
  if (direct.success) return createResult(direct.output)

  const chunkType = v.safeParse(streamChunkTypeSchema, input)
  if (!chunkType.success) return createResultError(op, "The provider stream chunk is invalid.")
  if (
    ["text_delta", "thinking_status", "tool_start", "tool_output", "tool_result", "written_file", "terminal"].includes(
      chunkType.output.type,
    )
  ) {
    return createResultError(op, v.summarize(direct.issues))
  }

  if (chunkType.output.type === "TEXT_MESSAGE_CONTENT") {
    const parsed = v.safeParse(textChunkSchema, input)
    if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
    return providerExecutionEventParse({ delta: parsed.output.delta, type: "text_delta" })
  }
  if (["REASONING_START", "THINKING_START"].includes(chunkType.output.type)) {
    return providerExecutionEventParse({ status: "started", type: "thinking_status" })
  }
  if (["REASONING_END", "THINKING_END"].includes(chunkType.output.type)) {
    return providerExecutionEventParse({ status: "finished", type: "thinking_status" })
  }
  if (chunkType.output.type === "TOOL_CALL_START") {
    const parsed = v.safeParse(toolStartChunkSchema, input)
    if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
    const toolName = parsed.output.toolCallName ?? parsed.output.toolName
    if (toolName === undefined) return createResultError(op, "The provider tool name is required.")
    return providerExecutionEventParse({
      toolCallId: parsed.output.toolCallId,
      toolName,
      type: "tool_start",
    })
  }
  if (chunkType.output.type === "TOOL_CALL_END") {
    const parsed = v.safeParse(toolEndChunkSchema, input)
    if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
    if (parsed.output.output === undefined && parsed.output.result === undefined) return createResult(null)
    return providerExecutionEventParse({
      output: parsed.output.output ?? parsed.output.result,
      toolCallId: parsed.output.toolCallId,
      type: "tool_output",
    })
  }
  if (chunkType.output.type === "TOOL_CALL_RESULT") {
    const parsed = v.safeParse(toolResultChunkSchema, input)
    if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
    const workingDirectory = parsed.output.workingDirectory ?? toolResultWorkingDirectoryResolve(parsed.output.content)
    return providerExecutionEventParse({
      outcome: parsed.output.state?.toLowerCase().includes("error") === true ? "error" : "success",
      result: parsed.output.content,
      toolCallId: parsed.output.toolCallId,
      type: "tool_result",
      ...(workingDirectory === undefined ? {} : { workingDirectory }),
    })
  }
  if (chunkType.output.type === "RUN_ERROR") {
    const parsed = v.safeParse(runErrorChunkSchema, input)
    if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
    return providerExecutionEventParse({
      ...(parsed.output.code === undefined ? {} : { code: parsed.output.code }),
      message: parsed.output.message,
      status: "error",
      type: "terminal",
    })
  }
  if (chunkType.output.type === "RUN_FINISHED") {
    const parsed = v.safeParse(runFinishedChunkSchema, input)
    if (!parsed.success) return createResultError(op, v.summarize(parsed.issues))
    return providerExecutionEventParse({
      status: providerExecutionEventTerminalStatus(parsed.output.outcome),
      type: "terminal",
    })
  }

  return createResult(null)
}
