import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { apiRevisionSchema } from "../../api/schema/apiRevisionSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"
import { sessionAgentPromptSchema } from "../schema/sessionAgentPromptSchema.js"
import { sessionExecutionSelectionSchema } from "../schema/sessionExecutionSelectionSchema.js"
import { sessionExecutionResourceSummarySchema } from "./sessionExecutionResourceSummarySchema.js"

const sessionTimestampSchema = v.pipe(v.string(), v.isoTimestamp())

export const sessionShellSchema = v.strictObject({
  agentPrompt: v.optional(v.nullable(sessionAgentPromptSchema)),
  archivedAt: v.nullable(sessionTimestampSchema),
  createdAt: sessionTimestampSchema,
  executionResources: v.optional(v.nullable(sessionExecutionResourceSummarySchema)),
  executionSelection: v.optional(v.nullable(sessionExecutionSelectionSchema)),
  id: apiPublicIdSchema,
  metadata: v.unknown(),
  parentSessionId: v.nullable(apiPublicIdSchema),
  pinned: v.boolean(),
  primaryAgentId: apiPublicIdSchema,
  projectId: v.optional(projectIdSchema),
  projectPath: v.pipe(v.string(), v.maxLength(4_096)),
  revision: apiRevisionSchema,
  serverId: apiPublicIdSchema,
  title: v.pipe(v.string(), v.maxLength(500)),
  updatedAt: sessionTimestampSchema,
})

export type SessionShell = v.InferOutput<typeof sessionShellSchema>
