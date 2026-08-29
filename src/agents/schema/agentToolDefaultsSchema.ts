import * as v from "valibot"

export const agentToolDefaultsSchema = v.strictObject({
  bash: v.optional(v.boolean(), false),
  webfetch: v.optional(v.boolean(), false),
  read: v.optional(v.boolean()),
  write: v.optional(v.boolean()),
  edit: v.optional(v.boolean()),
})

export type AgentToolDefaults = v.InferOutput<typeof agentToolDefaultsSchema>
