import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const journalCursorClaimsSchema = v.strictObject({
  journalId: apiPublicIdSchema,
  sequence: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(Number.MAX_SAFE_INTEGER)),
  version: v.literal(1),
})

export type JournalCursorClaims = v.InferOutput<typeof journalCursorClaimsSchema>
