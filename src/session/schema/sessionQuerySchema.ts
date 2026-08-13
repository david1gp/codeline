import * as v from "valibot"
import { sessionSearchQuerySchema } from "./sessionSearchQuerySchema.js"

export const sessionQuerySchema = v.object({
  cursor: v.optional(v.pipe(v.string(), v.maxLength(2048))),
  includeArchived: v.optional(v.picklist(["0", "1"]), "0"),
  limit: v.optional(
    v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(100)),
    "50",
  ),
  search: v.optional(sessionSearchQuerySchema),
})

export type SessionQuery = v.InferOutput<typeof sessionQuerySchema>
