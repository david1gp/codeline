import * as v from "valibot"
import { agentListResponseV2Schema } from "./agentListResponseV2Schema.js"

const agentFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

const agentListResponseLegacySchema = v.strictObject({
  agents: v.array(
    v.strictObject({
      id: agentFieldSchema,
      name: agentFieldSchema,
      parentAgentId: v.nullable(agentFieldSchema),
      role: agentFieldSchema,
      serverId: agentFieldSchema,
    }),
  ),
})

export const agentListResponseSchema = v.union([agentListResponseLegacySchema, agentListResponseV2Schema])

export type AgentListResponse = v.InferOutput<typeof agentListResponseSchema>
