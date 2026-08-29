import * as v from "valibot"
import { projectDiscoveryIdSchema } from "../../project/projectDiscoveryIdSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"

export const skillPresetInspectionResponseSchema = v.strictObject({
  diagnostics: v.array(
    v.strictObject({
      code: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
      message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
      path: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
      relativePath: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
      validation: v.literal("invalid"),
    }),
  ),
  digest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
  presets: v.array(skillPresetSchema),
  projectId: v.union([projectIdSchema, projectDiscoveryIdSchema]),
  version: v.literal(1),
})

export type SkillPresetInspectionResponse = v.InferOutput<typeof skillPresetInspectionResponseSchema>
