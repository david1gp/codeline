import * as v from "valibot"

const bashToolOutputTextSchema = v.pipe(v.string(), v.maxLength(1_048_576))
const bashToolOutputWorkingDirectorySchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4_096))

export const bashToolOutputSchema = v.strictObject({
  exitCode: v.pipe(v.number(), v.integer()),
  stderr: bashToolOutputTextSchema,
  stdout: bashToolOutputTextSchema,
  truncated: v.boolean(),
  workingDirectory: bashToolOutputWorkingDirectorySchema,
})

export type BashToolOutput = v.InferOutput<typeof bashToolOutputSchema>
