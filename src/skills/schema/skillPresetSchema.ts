import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"

const skillPresetNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

const skillPresetDescriptionSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000))
const skillPresetDisplayNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200))

const skillPresetSkillNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

const skillPresetFolderPathSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => {
    if (value === ".") return true
    if (value.startsWith("/") || value.includes("\\")) return false
    const segments = value.split("/")
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  }),
)

const skillPresetSkillNamesSchema = v.pipe(
  v.array(skillPresetSkillNameSchema),
  v.maxLength(skillDiscoveryLimits.maximumBundles),
  v.check((values) => new Set(values).size === values.length),
)

const skillPresetFolderPathsSchema = v.pipe(
  v.array(skillPresetFolderPathSchema),
  v.maxLength(skillDiscoveryLimits.maximumDirectories),
  v.check((values) => new Set(values).size === values.length),
)

export const skillPresetSchema = v.strictObject({
  description: v.optional(skillPresetDescriptionSchema),
  displayName: v.optional(skillPresetDisplayNameSchema),
  excludeSkills: v.optional(skillPresetSkillNamesSchema, []),
  immutable: v.optional(v.literal(true)),
  includeFolders: v.optional(skillPresetFolderPathsSchema, []),
  includeSkills: v.optional(skillPresetSkillNamesSchema, []),
  name: skillPresetNameSchema,
  version: v.literal(1),
})

export type SkillPreset = v.InferOutput<typeof skillPresetSchema>
