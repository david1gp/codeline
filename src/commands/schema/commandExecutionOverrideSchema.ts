import * as v from "valibot"

export const commandExecutionOverrideSchema = v.strictObject({
  agent: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  model: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  subtask: v.optional(v.boolean()),
})

export type CommandExecutionOverride = v.InferOutput<typeof commandExecutionOverrideSchema>
