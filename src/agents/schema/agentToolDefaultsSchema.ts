import * as v from "valibot"

export const agentToolDefaultsSchema = v.strictObject({
  bash: v.optional(v.boolean(), false),
  webfetch: v.optional(v.boolean(), false),
})

export type AgentToolDefaults = v.InferOutput<typeof agentToolDefaultsSchema>
