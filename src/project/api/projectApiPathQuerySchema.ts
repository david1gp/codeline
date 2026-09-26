import * as v from "valibot"

export const projectApiPathQuerySchema = v.strictObject({
  path: v.optional(v.pipe(v.string(), v.maxLength(4096)), ""),
})

export type ProjectApiPathQuery = v.InferOutput<typeof projectApiPathQuerySchema>
