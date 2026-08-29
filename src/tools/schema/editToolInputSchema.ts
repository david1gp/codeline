import * as v from "valibot"

const editToolFilePathSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => !value.includes("\0")),
)

export const editToolInputSchema = v.strictObject({
  file_path: editToolFilePathSchema,
  new_string: v.string(),
  old_string: v.pipe(v.string(), v.minLength(1)),
  replace_all: v.optional(v.boolean()),
})

export type EditToolInput = v.InferOutput<typeof editToolInputSchema>
