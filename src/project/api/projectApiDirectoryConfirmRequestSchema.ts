import * as v from "valibot"

export const projectApiDirectoryConfirmRequestSchema = v.strictObject({
  path: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4096)),
})

export type ProjectApiDirectoryConfirmRequest = v.InferOutput<typeof projectApiDirectoryConfirmRequestSchema>
