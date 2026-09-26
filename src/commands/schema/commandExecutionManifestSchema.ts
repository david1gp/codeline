import * as v from "valibot"
import { commandDigestSchema } from "./commandDigestSchema.js"
import { commandNameSchema } from "./commandNameSchema.js"

export const commandExecutionManifestSchema = v.strictObject({
  agent: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  model: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  name: commandNameSchema,
  subtask: v.optional(v.boolean()),
  templateDigest: commandDigestSchema,
  version: v.literal(1),
})

export type CommandExecutionManifest = v.InferOutput<typeof commandExecutionManifestSchema>
