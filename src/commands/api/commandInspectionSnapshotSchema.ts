import * as v from "valibot"
import { commandDigestSchema } from "../schema/commandDigestSchema.js"
import { commandNameSchema } from "../schema/commandNameSchema.js"

export const commandInspectionSnapshotSchema = v.strictObject({
  agent: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  description: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000))),
  name: commandNameSchema,
  path: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  size: v.pipe(v.number(), v.integer(), v.minValue(0)),
  source: v.picklist(["global", "project"]),
  subtask: v.optional(v.boolean()),
  template: v.pipe(v.string(), v.maxLength(1_048_576)),
  templateDigest: commandDigestSchema,
  validation: v.literal("valid"),
  model: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
})

export type CommandInspectionSnapshot = v.InferOutput<typeof commandInspectionSnapshotSchema>
