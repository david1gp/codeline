import * as v from "valibot"
import { agentConfigurationSchema } from "../schema/agentConfigurationSchema.js"
import { agentDetailResponseV2Schema } from "./agentDetailResponseV2Schema.js"

const agentFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

const agentDetailResponseLegacySchema = v.strictObject({
  agent: v.strictObject({
    configuration: agentConfigurationSchema,
    id: agentFieldSchema,
    name: agentFieldSchema,
    role: agentFieldSchema,
    serverId: agentFieldSchema,
  }),
})

export const agentDetailResponseSchema = v.union([agentDetailResponseLegacySchema, agentDetailResponseV2Schema])

export type AgentDetailResponse = v.InferOutput<typeof agentDetailResponseSchema>
