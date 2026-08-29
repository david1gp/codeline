import * as v from "valibot"

const writeToolFilePathSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => !value.includes("\0")),
)

export const writeToolInputSchema = v.strictObject({
  content: v.string(),
  file_path: writeToolFilePathSchema,
  version: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(512))),
})

export type WriteToolInput = v.InferOutput<typeof writeToolInputSchema>
