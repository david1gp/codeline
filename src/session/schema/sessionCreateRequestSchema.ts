import * as v from "valibot"
import { sessionExecutionSelectionSchema } from "./sessionExecutionSelectionSchema.js"

export const sessionCreateRequestSchema = v.strictObject({
  clientRequestId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  executionSelection: v.optional(sessionExecutionSelectionSchema),
  metadata: v.optional(v.record(v.string(), v.pipe(v.string(), v.maxLength(500))), {}),
  primaryAgentId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  projectPath: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4096))),
  serverId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
})

export type SessionCreateRequest = v.InferOutput<typeof sessionCreateRequestSchema>
