import * as v from "valibot"

const executionStreamIdentifierSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
const executionStreamBoundedContentSchema = v.pipe(v.string(), v.maxLength(16_384))
const executionStreamWrittenPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(2_048),
  v.check(
    (path) =>
      !path.startsWith("/") &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      path.split("/").every((part) => part !== "" && part !== "." && part !== ".."),
    "Written-file paths must be relative normalized POSIX paths.",
  ),
)

export const executionStreamEventSchema = v.variant("eventType", [
  v.strictObject({
    eventType: v.literal("text_delta"),
    payload: v.strictObject({ delta: v.pipe(v.string(), v.maxLength(32_768)) }),
  }),
  v.strictObject({
    eventType: v.literal("thinking_status"),
    payload: v.strictObject({ status: v.union([v.literal("started"), v.literal("finished")]) }),
  }),
  v.strictObject({
    eventType: v.literal("tool_start"),
    payload: v.strictObject({
      toolCallId: executionStreamIdentifierSchema,
      toolName: executionStreamIdentifierSchema,
    }),
  }),
  v.strictObject({
    eventType: v.literal("tool_output"),
    payload: v.strictObject({
      output: executionStreamBoundedContentSchema,
      toolCallId: executionStreamIdentifierSchema,
      truncated: v.boolean(),
    }),
  }),
  v.strictObject({
    eventType: v.literal("tool_result"),
    payload: v.strictObject({
      outcome: v.union([v.literal("success"), v.literal("error")]),
      result: executionStreamBoundedContentSchema,
      toolCallId: executionStreamIdentifierSchema,
      truncated: v.boolean(),
    }),
  }),
  v.strictObject({
    eventType: v.literal("written_file"),
    payload: v.strictObject({ path: executionStreamWrittenPathSchema }),
  }),
  v.strictObject({
    eventType: v.literal("terminal"),
    payload: v.strictObject({
      code: v.optional(executionStreamIdentifierSchema),
      message: v.optional(v.pipe(v.string(), v.maxLength(4_096))),
      status: v.union([v.literal("completed"), v.literal("error"), v.literal("aborted")]),
    }),
  }),
])

export type ExecutionStreamEvent = v.InferOutput<typeof executionStreamEventSchema>
