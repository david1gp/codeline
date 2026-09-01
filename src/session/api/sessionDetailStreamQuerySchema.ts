import * as v from "valibot"
import { journalCursorSchema } from "../../journal/schema/journalCursorSchema.js"

export const sessionDetailStreamQuerySchema = v.strictObject({
  after: v.optional(journalCursorSchema),
})

export type SessionDetailStreamQuery = v.InferOutput<typeof sessionDetailStreamQuerySchema>
