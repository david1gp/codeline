import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const journalGlobalCursorClaimsSchema = v.strictObject({
  globalSequence: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
  journalId: apiPublicIdSchema,
  version: v.literal(1),
})

export type JournalGlobalCursorClaims = v.InferOutput<typeof journalGlobalCursorClaimsSchema>
