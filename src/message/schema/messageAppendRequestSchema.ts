import * as v from "valibot"

export const messageAppendRequestSchema = v.object({
  clientRequestId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  content: v.pipe(v.string(), v.minLength(1), v.maxLength(100_000)),
  role: v.picklist(["assistant", "user"]),
})

export type MessageAppendRequest = v.InferOutput<typeof messageAppendRequestSchema>
