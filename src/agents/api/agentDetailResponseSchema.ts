import * as v from "valibot"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"

const agentFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const agentDetailResponseSchema = v.strictObject({
  agent: v.strictObject({
    configuration: agentConfigurationSchema,
    id: agentFieldSchema,
    name: agentFieldSchema,
    role: agentFieldSchema,
    serverId: agentFieldSchema,
  }),
})

export type AgentDetailResponse = v.InferOutput<typeof agentDetailResponseSchema>
