import * as v from "valibot"

export const projectTextReadResultSchema = v.object({
  path: v.string(),
  content: v.string(),
  size: v.number(),
})

export type ProjectTextReadResult = v.InferOutput<typeof projectTextReadResultSchema>
