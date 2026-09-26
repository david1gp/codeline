import * as v from "valibot"
import { commandDigestSchema } from "./commandDigestSchema.js"
import { commandNameSchema } from "./commandNameSchema.js"

const commandExpansionOverridesSchema = v.strictObject({
  agent: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  model: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  subtask: v.optional(v.boolean()),
})

export const commandExpansionSchema = v.strictObject({
  arguments: v.array(v.string()),
  argumentsText: v.pipe(v.string(), v.maxLength(100_000)),
  catalogDigest: v.optional(commandDigestSchema),
  commandName: commandNameSchema,
  expandedText: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100_000)),
  overrides: commandExpansionOverridesSchema,
  templateDigest: commandDigestSchema,
  version: v.literal(1),
})

export type CommandExpansion = v.InferOutput<typeof commandExpansionSchema>
