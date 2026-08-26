import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { sessionExecutionSelectionSchema } from "../schema/sessionExecutionSelectionSchema.js"

const sessionTimestampSchema = v.pipe(v.string(), v.isoTimestamp())

export const sessionShellSchema = v.strictObject({
  archivedAt: v.nullable(sessionTimestampSchema),
  createdAt: sessionTimestampSchema,
  executionSelection: v.optional(v.nullable(sessionExecutionSelectionSchema)),
  id: apiPublicIdSchema,
  metadata: v.unknown(),
  parentSessionId: v.nullable(apiPublicIdSchema),
  pinned: v.boolean(),
  primaryAgentId: apiPublicIdSchema,
  projectPath: v.pipe(v.string(), v.maxLength(4_096)),
  revision: apiRevisionSchema,
  serverId: apiPublicIdSchema,
  title: v.pipe(v.string(), v.maxLength(500)),
  updatedAt: sessionTimestampSchema,
})

export type SessionShell = v.InferOutput<typeof sessionShellSchema>
