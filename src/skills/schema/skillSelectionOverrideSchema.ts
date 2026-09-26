import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"

const skillSelectionOverrideNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

const skillSelectionOverrideNamesSchema = v.pipe(
  v.array(skillSelectionOverrideNameSchema),
  v.maxLength(skillDiscoveryLimits.maximumBundles),
  v.check((values) => new Set(values).size === values.length),
)

export const skillSelectionOverrideSchema = v.strictObject({
  disabledSkills: v.optional(skillSelectionOverrideNamesSchema, []),
  enabledSkills: v.optional(skillSelectionOverrideNamesSchema, []),
})

export type SkillSelectionOverride = v.InferOutput<typeof skillSelectionOverrideSchema>
