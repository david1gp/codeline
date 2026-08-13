import * as v from "valibot"

export const projectApiTextResponseSchema = v.strictObject({
  path: v.string(),
  content: v.string(),
  size: v.number(),
})

export type ProjectApiTextResponse = v.InferOutput<typeof projectApiTextResponseSchema>
