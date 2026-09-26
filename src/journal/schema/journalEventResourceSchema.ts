import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const journalEventResourceSchema = v.strictObject({
  resourceId: apiPublicIdSchema,
  resourceType: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100), v.regex(/^[^\r\n]+$/)),
})

export type JournalEventResource = v.InferOutput<typeof journalEventResourceSchema>
