import * as v from "valibot"
import { messageApiRecordSchema } from "../../message/api/messageApiRecordSchema.js"
import { sessionShellSchema } from "./sessionShellSchema.js"

export const sessionSnapshotPayloadSchema = v.strictObject({
  messages: v.array(messageApiRecordSchema),
  session: sessionShellSchema,
  settled: v.literal(true),
})

export type SessionSnapshotPayload = v.InferOutput<typeof sessionSnapshotPayloadSchema>
