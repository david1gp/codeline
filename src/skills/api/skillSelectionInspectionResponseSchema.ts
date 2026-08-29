import * as v from "valibot"
import { projectDiscoveryIdSchema } from "../../project/projectDiscoveryIdSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"
import { skillDescriptionCatalogSchema } from "../schema/skillDescriptionCatalogSchema.js"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"
import { skillSelectionOverrideSchema } from "../schema/skillSelectionOverrideSchema.js"
import { skillInspectionSnapshotSchema } from "./skillInspectionSnapshotSchema.js"

const skillSelectionInspectionNamesSchema = v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)))
const skillSelectionInspectionFolderPathsSchema = v.array(
  v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(4_096),
    v.check((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..")),
  ),
)

export const skillSelectionInspectionResponseSchema = v.strictObject({
  catalogDigest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
  descriptionCatalog: skillDescriptionCatalogSchema,
  preset: skillPresetSchema,
  presetCatalogDigest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
  projectId: v.union([projectIdSchema, projectDiscoveryIdSchema]),
  selection: v.strictObject({
    activeSkills: v.array(skillInspectionSnapshotSchema),
    excludedSkillNames: skillSelectionInspectionNamesSchema,
    missingFolderPaths: skillSelectionInspectionFolderPathsSchema,
    missingSkillNames: skillSelectionInspectionNamesSchema,
    presetName: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
    userOverride: skillSelectionOverrideSchema,
    version: v.literal(1),
  }),
  version: v.literal(1),
})

export type SkillSelectionInspectionResponse = v.InferOutput<typeof skillSelectionInspectionResponseSchema>
