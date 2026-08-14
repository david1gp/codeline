import * as v from "valibot"

export const projectApiProjectQuerySchema = v.strictObject({
  project: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
})

export type ProjectApiProjectQuery = v.InferOutput<typeof projectApiProjectQuerySchema>
