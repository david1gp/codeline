import * as v from "valibot"

const providerExecutionIdentifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
const providerExecutionTextSchema = v.pipe(v.string(), v.maxLength(32_768))

export const providerExecutionEventSchema = v.variant("type", [
  v.strictObject({
    delta: providerExecutionTextSchema,
    type: v.literal("text_delta"),
  }),
  v.strictObject({
    status: v.union([v.literal("started"), v.literal("finished")]),
    type: v.literal("thinking_status"),
  }),
  v.strictObject({
    toolCallId: providerExecutionIdentifierSchema,
    toolName: providerExecutionIdentifierSchema,
    type: v.literal("tool_start"),
  }),
  v.strictObject({
    output: v.unknown(),
    toolCallId: providerExecutionIdentifierSchema,
    type: v.literal("tool_output"),
  }),
  v.strictObject({
    outcome: v.union([v.literal("success"), v.literal("error")]),
    result: v.unknown(),
    toolCallId: providerExecutionIdentifierSchema,
    type: v.literal("tool_result"),
  }),
  v.strictObject({
    path: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
    type: v.literal("written_file"),
  }),
  v.strictObject({
    code: v.optional(providerExecutionIdentifierSchema),
    message: v.optional(providerExecutionTextSchema),
    status: v.union([v.literal("completed"), v.literal("error"), v.literal("aborted")]),
    type: v.literal("terminal"),
  }),
])

export type ProviderExecutionEvent = v.InferOutput<typeof providerExecutionEventSchema>
