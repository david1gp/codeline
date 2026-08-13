import * as v from "valibot"

export const agentQuerySchema = v.object({
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))),
})

export type AgentQuery = v.InferOutput<typeof agentQuerySchema>
