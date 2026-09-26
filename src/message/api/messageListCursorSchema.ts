import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

export const messageListCursorSchema = v.strictObject({
  id: apiPublicIdSchema,
  sequence: v.pipe(v.number(), v.integer(), v.minValue(1)),
  sessionId: apiPublicIdSchema,
  version: v.literal(1),
})

export type MessageListCursor = v.InferOutput<typeof messageListCursorSchema>
