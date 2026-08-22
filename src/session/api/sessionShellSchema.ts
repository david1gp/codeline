import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"

const sessionTimestampSchema = v.pipe(v.string(), v.isoTimestamp())

export const sessionShellSchema = v.strictObject({
  archivedAt: v.nullable(sessionTimestampSchema),
  createdAt: sessionTimestampSchema,
  id: apiPublicIdSchema,
  metadata: v.unknown(),
  parentSessionId: v.nullable(apiPublicIdSchema),
  pinned: v.boolean(),
  primaryAgentId: apiPublicIdSchema,
  projectPath: v.pipe(v.string(), v.maxLength(4_096)),
  serverId: apiPublicIdSchema,
  title: v.pipe(v.string(), v.maxLength(500)),
  updatedAt: sessionTimestampSchema,
})

export type SessionShell = v.InferOutput<typeof sessionShellSchema>
