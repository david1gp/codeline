import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"

const runToolDetailCallIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(256))
const runToolDetailContentSchema = v.pipe(v.string(), v.maxLength(8_192))
const runToolDetailToolNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(256))
const runToolDetailWorkingDirectorySchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4_096))

export const runToolDetailSchema = v.strictObject({
  detailId: apiPublicIdSchema,
  outcome: v.optional(v.union([v.literal("success"), v.literal("error")])),
  output: v.optional(runToolDetailContentSchema),
  outputTruncated: v.optional(v.boolean()),
  result: v.optional(runToolDetailContentSchema),
  resultTruncated: v.optional(v.boolean()),
  sequence: apiSequenceSchema,
  toolCallId: runToolDetailCallIdSchema,
  toolName: v.optional(runToolDetailToolNameSchema),
  workingDirectory: v.optional(runToolDetailWorkingDirectorySchema),
})

export type RunToolDetail = v.InferOutput<typeof runToolDetailSchema>
