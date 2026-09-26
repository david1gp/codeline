import * as v from "valibot"

const commandFrontmatterAgentSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))
const commandFrontmatterModelSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

export const commandFrontmatterSchema = v.strictObject({
  agent: v.optional(commandFrontmatterAgentSchema),
  description: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000))),
  model: v.optional(commandFrontmatterModelSchema),
  subtask: v.optional(v.boolean()),
})

export type CommandFrontmatter = v.InferOutput<typeof commandFrontmatterSchema>
