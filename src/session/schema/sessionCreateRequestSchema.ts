import * as v from "valibot"
import { commandInvocationSchema } from "../../commands/schema/commandInvocationSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"
import { skillSelectionRequestSchema } from "../../skills/schema/skillSelectionRequestSchema.js"
import { sessionAgentPromptSchema } from "./sessionAgentPromptSchema.js"
import { sessionExecutionSelectionSchema } from "./sessionExecutionSelectionSchema.js"
import { sessionInstructionOverridesSchema } from "./sessionInstructionOverridesSchema.js"

export const sessionCreateRequestSchema = v.strictObject({
  clientRequestId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  agentPrompt: v.optional(sessionAgentPromptSchema),
  command: v.optional(commandInvocationSchema),
  executionSelection: v.optional(sessionExecutionSelectionSchema),
  instructionOverrides: v.optional(sessionInstructionOverridesSchema),
  skillSelection: v.optional(skillSelectionRequestSchema),
  metadata: v.optional(v.record(v.string(), v.pipe(v.string(), v.maxLength(500))), {}),
  primaryAgentId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  projectId: v.optional(projectIdSchema),
  projectPath: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4096))),
  serverId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
})

export type SessionCreateRequest = v.InferOutput<typeof sessionCreateRequestSchema>
