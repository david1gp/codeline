import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"
import { runFailureMetadataSchema } from "../schema/runFailureMetadataSchema.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"
import { attemptStatusSchema } from "../schema/attemptStatusSchema.js"

const runTranscriptContentSchema = v.pipe(v.string(), v.maxLength(8_192))
const runTranscriptIdentifierSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(256))
const runTranscriptActivitySequenceSchema = v.optional(apiSequenceSchema)
const runTranscriptToolMetadata = {
  sequence: runTranscriptActivitySequenceSchema,
  toolCallId: v.optional(runTranscriptIdentifierSchema),
}
const runTranscriptActivitySchema = v.variant("kind", [
  v.strictObject({
    kind: v.literal("thinking"),
    phase: v.literal("started"),
    sequence: runTranscriptActivitySequenceSchema,
  }),
  v.strictObject({
    kind: v.literal("thinking"),
    phase: v.literal("finished"),
    sequence: runTranscriptActivitySequenceSchema,
  }),
  v.strictObject({
    content: runTranscriptContentSchema,
    kind: v.literal("thinking"),
    phase: v.literal("delta"),
    sequence: runTranscriptActivitySequenceSchema,
  }),
  v.strictObject({
    kind: v.literal("tool"),
    name: v.optional(runTranscriptIdentifierSchema),
    phase: v.literal("started"),
    ...runTranscriptToolMetadata,
  }),
  v.strictObject({
    ...runTranscriptToolMetadata,
    content: runTranscriptContentSchema,
    kind: v.literal("tool"),
    name: v.optional(runTranscriptIdentifierSchema),
    phase: v.literal("delta"),
  }),
  v.strictObject({
    ...runTranscriptToolMetadata,
    content: runTranscriptContentSchema,
    kind: v.literal("tool"),
    name: v.optional(runTranscriptIdentifierSchema),
    phase: v.literal("output"),
    truncated: v.boolean(),
  }),
  v.strictObject({
    ...runTranscriptToolMetadata,
    content: runTranscriptContentSchema,
    kind: v.literal("tool"),
    name: v.optional(runTranscriptIdentifierSchema),
    outcome: v.union([v.literal("success"), v.literal("error")]),
    phase: v.literal("result"),
    truncated: v.boolean(),
    workingDirectory: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(4_096))),
  }),
  v.strictObject({ kind: v.literal("written_file"), path: v.pipe(v.string(), v.minLength(1), v.maxLength(2_048)) }),
])

const runTranscriptCancellationSchema = v.strictObject({
  kind: v.optional(runCancellationKindSchema),
  reason: v.optional(v.pipe(v.string(), v.maxLength(200))),
})
const runTranscriptTerminalSchema = v.variant("status", [
  v.strictObject({ status: v.literal("completed") }),
  v.strictObject({ status: v.literal("aborted"), reason: v.optional(v.pipe(v.string(), v.maxLength(200))) }),
  v.strictObject({ failure: v.optional(runFailureMetadataSchema), status: v.literal("failed") }),
])

export const runTranscriptSchema = v.strictObject({
  activities: v.pipe(v.array(runTranscriptActivitySchema), v.maxLength(1_000)),
  assistantText: runTranscriptContentSchema,
  authoritativeAttemptOrdinal: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  attempts: v.pipe(
    v.array(
      v.strictObject({
        ordinal: v.pipe(v.number(), v.integer(), v.minValue(1)),
        status: attemptStatusSchema,
      }),
    ),
    v.maxLength(100),
  ),
  cancellation: v.nullable(runTranscriptCancellationSchema),
  failure: v.nullable(runFailureMetadataSchema),
  invariantViolations: v.pipe(v.array(v.pipe(v.string(), v.maxLength(200))), v.maxLength(100)),
  terminalOutcome: v.nullable(runTranscriptTerminalSchema),
})

export type RunTranscript = v.InferOutput<typeof runTranscriptSchema>
