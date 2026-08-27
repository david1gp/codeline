import * as v from "valibot"

const bashToolCommandSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(100_000),
  v.check((value) => !value.includes("\0")),
)
const bashToolWorkingDirectorySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => !value.includes("\0")),
)

export const bashToolInputSchema = v.strictObject({
  command: bashToolCommandSchema,
  workingDirectory: v.optional(bashToolWorkingDirectorySchema),
})

export type BashToolInput = v.InferOutput<typeof bashToolInputSchema>
