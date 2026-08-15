import * as v from "valibot"

export const projectApiDirectorySuggestionsQuerySchema = v.strictObject({
  path: v.optional(v.pipe(v.string(), v.maxLength(4096)), ""),
})

export type ProjectApiDirectorySuggestionsQuery = v.InferOutput<typeof projectApiDirectorySuggestionsQuerySchema>
