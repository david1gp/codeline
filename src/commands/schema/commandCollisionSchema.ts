import * as v from "valibot"
import { commandDigestSchema } from "./commandDigestSchema.js"
import { commandNameSchema } from "./commandNameSchema.js"

const commandCollisionCandidateSchema = v.strictObject({
  canonicalPath: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
  digest: commandDigestSchema,
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  relativePath: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
  source: v.picklist(["global", "project"]),
  templateDigest: commandDigestSchema,
})

export const commandCollisionSchema = v.strictObject({
  candidates: v.pipe(v.array(commandCollisionCandidateSchema), v.minLength(2)),
  name: commandNameSchema,
  winner: commandCollisionCandidateSchema,
})

export type CommandCollision = v.InferOutput<typeof commandCollisionSchema>
