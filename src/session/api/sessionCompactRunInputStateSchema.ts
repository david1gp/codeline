import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiSequenceSchema } from "../../api/schema/apiSequenceSchema.js"
import { runStatusSchema } from "../../run/schema/runStatusSchema.js"

const compactStateTextSchema = v.pipe(v.string(), v.maxLength(16_384))
const sessionInputStateSchema = v.strictObject({
  prompt: compactStateTextSchema,
  requestId: apiPublicIdSchema,
})
const sessionCompactRunStateSchema = v.strictObject({
  lastSequence: apiSequenceSchema,
  partialText: compactStateTextSchema,
  runId: apiPublicIdSchema,
  sessionId: apiPublicIdSchema,
  status: runStatusSchema,
})

export const sessionCompactRunInputStateSchema = v.strictObject({
  input: v.nullable(sessionInputStateSchema),
  run: v.nullable(sessionCompactRunStateSchema),
})

export type SessionCompactRunInputState = v.InferOutput<typeof sessionCompactRunInputStateSchema>
