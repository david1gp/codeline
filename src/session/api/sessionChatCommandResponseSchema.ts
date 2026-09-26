import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const sessionChatCommandResponseSchema = v.strictObject({
  runId: apiPublicIdSchema,
  sessionId: apiPublicIdSchema,
})

export type SessionChatCommandResponse = v.InferOutput<typeof sessionChatCommandResponseSchema>
