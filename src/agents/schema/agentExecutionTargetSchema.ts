import * as v from "valibot"

const targetIdSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const agentExecutionTargetSchema = v.strictObject({
  agentId: targetIdSchema,
  serverId: targetIdSchema,
})

export type AgentExecutionTarget = v.InferOutput<typeof agentExecutionTargetSchema>
