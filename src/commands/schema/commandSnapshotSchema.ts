import * as path from "node:path"
import * as v from "valibot"
import { commandDigestSchema } from "./commandDigestSchema.js"
import { commandNameSchema } from "./commandNameSchema.js"

const commandSnapshotPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)

export const commandSnapshotSchema = v.strictObject({
  agent: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  body: v.pipe(v.string(), v.maxLength(1_048_576)),
  canonicalPath: commandSnapshotPathSchema,
  description: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000))),
  digest: commandDigestSchema,
  model: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))),
  name: commandNameSchema,
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  relativePath: v.pipe(
    v.string(),
    v.minLength(1),
    v.maxLength(4_096),
    v.check((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..")),
  ),
  size: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_048_576)),
  source: v.picklist(["global", "project"]),
  subtask: v.optional(v.boolean()),
  templateDigest: commandDigestSchema,
})

export type CommandSnapshot = v.InferOutput<typeof commandSnapshotSchema>
