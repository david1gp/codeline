import {
  chat,
  EventType,
  toolDefinition,
  type AnyTextAdapter,
  type ModelMessage,
  type SchemaInput,
  type StreamChunk,
} from "@tanstack/ai"
import * as v from "valibot"

const DELEGATE_TASK_INPUT_LIMIT = 100_000
const DELEGATE_TASK_OUTPUT_LIMIT = 16_384

function providerDelegationStreamChunkJsonSafe(chunk: StreamChunk): StreamChunk {
  return Object.fromEntries(Object.entries(chunk).filter(([, value]) => value !== undefined)) as StreamChunk
}

const delegateTaskValidationSchema = v.strictObject({
  agentId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  task: v.pipe(v.string(), v.minLength(1), v.maxLength(DELEGATE_TASK_INPUT_LIMIT)),
})

const delegateTaskInputSchema: SchemaInput = {
  "~standard": {
    jsonSchema: {
      input: () => ({
        additionalProperties: false,
        properties: {
          agentId: { maxLength: 200, minLength: 1, type: "string" },
          task: { maxLength: DELEGATE_TASK_INPUT_LIMIT, minLength: 1, type: "string" },
        },
        required: ["task"],
        type: "object",
      }),
    },
    validate: (input) => {
      const parsed = v.safeParse(delegateTaskValidationSchema, input)
      return parsed.success ? { value: parsed.output } : { issues: parsed.issues }
    },
    vendor: "codeline",
    version: 1,
  },
}

export type ProviderDelegationToolLoopInput = {
  messages: Array<ModelMessage>
  runId: string
  signal: AbortSignal
  threadId: string
}

export type ProviderDelegationToolLoopOptions = {
  adapter: AnyTextAdapter
  delegateTask: (input: {
    agentId?: string
    signal: AbortSignal
    task: string
    toolCallId: string
  }) => Promise<string> | string
}

export type ProviderDelegationToolLoop = (input: ProviderDelegationToolLoopInput) => AsyncIterable<StreamChunk>

export function providerDelegationToolLoopCreate(
  options: ProviderDelegationToolLoopOptions,
): ProviderDelegationToolLoop {
  return (input) => providerDelegationToolLoopGenerate(options, input)
}

async function* providerDelegationToolLoopGenerate(
  options: ProviderDelegationToolLoopOptions,
  input: ProviderDelegationToolLoopInput,
): AsyncGenerator<StreamChunk> {
  if (input.signal.aborted) return

  const abortController = new AbortController()
  const abort = () => abortController.abort(input.signal.reason)
  input.signal.addEventListener("abort", abort, { once: true })
  if (input.signal.aborted) abort()

  const delegateTask = toolDefinition({
    description: "Run one synchronous delegated coding task and return its text result.",
    inputSchema: delegateTaskInputSchema,
    name: "delegate_task",
  }).server(async (rawInput, context) => {
    const parsedInput = v.safeParse(delegateTaskValidationSchema, rawInput)
    if (!parsedInput.success) throw new Error("The delegate_task input is invalid.")

    const { agentId, task } = parsedInput.output
    const toolCallId = context?.toolCallId
    if (toolCallId === undefined || toolCallId === "") throw new Error("The delegation tool call ID is required.")

    const signal = context?.abortSignal ?? input.signal
    if (signal.aborted) throw new Error("The delegated task was cancelled.")

    const result = await options.delegateTask({
      ...(agentId === undefined ? {} : { agentId }),
      signal,
      task,
      toolCallId,
    })
    if (typeof result !== "string") throw new Error("The delegated task result must be text.")
    return result.slice(0, DELEGATE_TASK_OUTPUT_LIMIT)
  })

  let finalChunk: Extract<StreamChunk, { type: "RUN_FINISHED" }> | undefined
  let emittedError = false

  try {
    yield {
      type: EventType.RUN_STARTED,
      runId: input.runId,
      threadId: input.threadId,
      timestamp: Date.now(),
    }

    for await (const chunk of chat({
      abortController,
      adapter: options.adapter,
      messages: input.messages,
      runId: input.runId,
      threadId: input.threadId,
      tools: [delegateTask],
    })) {
      if (chunk.type === EventType.RUN_STARTED) continue
      if (chunk.type === EventType.RUN_FINISHED) {
        finalChunk = chunk
        continue
      }
      if (chunk.type === EventType.RUN_ERROR) emittedError = true
      yield providerDelegationStreamChunkJsonSafe(chunk)
    }
  } catch {
    if (!input.signal.aborted) {
      emittedError = true
      yield {
        code: "provider_delegation_tool_loop_error",
        message: "The provider delegation tool loop failed.",
        timestamp: Date.now(),
        type: EventType.RUN_ERROR,
      }
    }
  } finally {
    input.signal.removeEventListener("abort", abort)
  }

  if (input.signal.aborted || abortController.signal.aborted) {
    yield {
      finishReason: "stop",
      outcome: { type: "interrupt", interrupts: [] },
      runId: input.runId,
      threadId: input.threadId,
      timestamp: Date.now(),
      type: EventType.RUN_FINISHED,
    }
    return
  }

  if (emittedError) return

  yield providerDelegationStreamChunkJsonSafe({
    ...(finalChunk ?? {}),
    finishReason: finalChunk?.finishReason ?? "stop",
    outcome: finalChunk?.outcome ?? { type: "success" },
    runId: input.runId,
    threadId: input.threadId,
    timestamp: Date.now(),
    type: EventType.RUN_FINISHED,
  })
}
