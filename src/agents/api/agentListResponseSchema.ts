import * as v from "valibot"

const agentFieldSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const agentListResponseSchema = v.strictObject({
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

export type AgentListResponse = v.InferOutput<typeof agentListResponseSchema>
