import * as v from "valibot"

export const writeToolOutputSchema = v.strictObject({
  after: v.string(),
  before: v.nullable(v.string()),
  operation: v.picklist(["create", "update"]),
  path: v.pipe(v.string(), v.minLength(1)),
})

export type WriteToolOutput = v.InferOutput<typeof writeToolOutputSchema>
