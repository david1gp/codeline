import * as v from "valibot"
import { agentConfigurationSchema } from "./agentConfigurationSchema.js"

export const agentProviderRequestSchema = v.strictObject({
  configuration: v.optional(agentConfigurationSchema),
})

export type AgentProviderRequest = v.InferOutput<typeof agentProviderRequestSchema>
