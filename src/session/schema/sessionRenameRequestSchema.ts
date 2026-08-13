import * as v from "valibot"

export const sessionRenameRequestSchema = v.strictObject({
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
})

export type SessionRenameRequest = v.InferOutput<typeof sessionRenameRequestSchema>
