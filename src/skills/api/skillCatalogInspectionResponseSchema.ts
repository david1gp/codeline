import * as v from "valibot"
import { skillInspectionSnapshotSchema } from "./skillInspectionSnapshotSchema.js"

const skillCatalogInspectionPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..")),
)
const skillCatalogInspectionDiagnosticSchema = v.strictObject({
  bundlePath: v.optional(skillCatalogInspectionPathSchema),
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  path: skillCatalogInspectionPathSchema,
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  relativePath: skillCatalogInspectionPathSchema,
  source: v.picklist(["global", "project"]),
  validation: v.literal("invalid"),
})
const skillCatalogInspectionRootSchema = v.strictObject({
  path: skillCatalogInspectionPathSchema,
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  source: v.picklist(["global", "project"]),
})
const skillCatalogInspectionGroupSchema = v.strictObject({
  path: skillCatalogInspectionPathSchema,
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  source: v.picklist(["global", "project"]),
})
const skillCatalogInspectionCollisionCandidateSchema = v.strictObject({
  bundlePath: skillCatalogInspectionPathSchema,
  digest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  source: v.picklist(["global", "project"]),
})
const skillCatalogInspectionCollisionSchema = v.strictObject({
  candidates: v.array(skillCatalogInspectionCollisionCandidateSchema),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  winner: skillCatalogInspectionCollisionCandidateSchema,
})

export const skillCatalogInspectionResponseSchema = v.strictObject({
  bundles: v.array(skillInspectionSnapshotSchema),
  collisions: v.array(skillCatalogInspectionCollisionSchema),
  diagnostics: v.array(skillCatalogInspectionDiagnosticSchema),
  digest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
  groups: v.array(skillCatalogInspectionGroupSchema),
  projectId: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)),
  roots: v.array(skillCatalogInspectionRootSchema),
  skills: v.array(skillInspectionSnapshotSchema),
  version: v.literal(1),
})

export type SkillCatalogInspectionResponse = v.InferOutput<typeof skillCatalogInspectionResponseSchema>
