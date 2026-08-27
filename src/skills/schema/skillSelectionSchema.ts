import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"
import { skillSelectionOverrideSchema } from "./skillSelectionOverrideSchema.js"
import { skillSnapshotSchema } from "./skillSnapshotSchema.js"

const skillSelectionNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

const skillSelectionFolderPathSchema = v.pipe(
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

const skillSelectionNamesSchema = v.pipe(
  v.array(skillSelectionNameSchema),
  v.maxLength(skillDiscoveryLimits.maximumBundles),
  v.check((values) => new Set(values).size === values.length),
)

const skillSelectionFolderPathsSchema = v.pipe(
  v.array(skillSelectionFolderPathSchema),
  v.maxLength(skillDiscoveryLimits.maximumDirectories),
  v.check((values) => new Set(values).size === values.length),
)

export const skillSelectionSchema = v.pipe(
  v.strictObject({
    activeSkills: v.pipe(
      v.array(skillSnapshotSchema),
      v.maxLength(skillDiscoveryLimits.maximumBundles),
      v.check((skills) => new Set(skills.map(({ name }) => name)).size === skills.length),
    ),
    excludedSkillNames: skillSelectionNamesSchema,
    missingFolderPaths: skillSelectionFolderPathsSchema,
    missingSkillNames: skillSelectionNamesSchema,
    presetName: skillSelectionNameSchema,
    userOverride: skillSelectionOverrideSchema,
    version: v.literal(1),
  }),
  v.check(({ activeSkills }) =>
    activeSkills.every((skill, index) => index === 0 || activeSkills[index - 1]!.name < skill.name),
  ),
)

export type SkillSelection = v.InferOutput<typeof skillSelectionSchema>
