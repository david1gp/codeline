import * as v from "valibot"

export const editToolOutputSchema = v.strictObject({
  after: v.string(),
  before: v.string(),
  path: v.pipe(v.string(), v.minLength(1)),
})

export type EditToolOutput = v.InferOutput<typeof editToolOutputSchema>
