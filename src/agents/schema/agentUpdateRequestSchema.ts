import * as v from "valibot"
import { agentConfigurationSchema } from "./agentConfigurationSchema.js"

const agentMetadataFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const agentUpdateRequestSchema = v.pipe(
  v.strictObject({
    configuration: v.optional(agentConfigurationSchema),
    name: v.optional(agentMetadataFieldSchema),
    role: v.optional(agentMetadataFieldSchema),
  }),
  v.check((input) => input.configuration !== undefined || input.name !== undefined || input.role !== undefined),
)

export type AgentUpdateRequest = v.InferOutput<typeof agentUpdateRequestSchema>
