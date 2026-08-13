import * as v from "valibot"

export const sessionBranchRequestSchema = v.strictObject({
  clientRequestId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  messageId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
})

export type SessionBranchRequest = v.InferOutput<typeof sessionBranchRequestSchema>
