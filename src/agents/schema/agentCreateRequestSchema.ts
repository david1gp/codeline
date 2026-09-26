import * as v from "valibot"
import { agentConfigurationSchema } from "./agentConfigurationSchema.js"

const agentMetadataFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const agentCreateRequestSchema = v.strictObject({
  configuration: agentConfigurationSchema,
  name: agentMetadataFieldSchema,
  role: agentMetadataFieldSchema,
})

export type AgentCreateRequest = v.InferOutput<typeof agentCreateRequestSchema>
