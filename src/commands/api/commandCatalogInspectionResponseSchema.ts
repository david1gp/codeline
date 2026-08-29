import * as v from "valibot"
import { projectDiscoveryIdSchema } from "../../project/projectDiscoveryIdSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"
import { commandDigestSchema } from "../schema/commandDigestSchema.js"
import { commandInspectionSnapshotSchema } from "./commandInspectionSnapshotSchema.js"

const commandInspectionPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..")),
)
const commandInspectionDiagnosticSchema = v.strictObject({
  code: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  path: commandInspectionPathSchema,
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  relativePath: commandInspectionPathSchema,
  source: v.picklist(["global", "project"]),
  validation: v.literal("invalid"),
})
const commandInspectionRootSchema = v.strictObject({
  path: commandInspectionPathSchema,
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  source: v.picklist(["global", "project"]),
})
const commandInspectionCollisionCandidateSchema = v.strictObject({
  digest: commandDigestSchema,
  path: commandInspectionPathSchema,
  precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
  source: v.picklist(["global", "project"]),
  templateDigest: commandDigestSchema,
})
const commandInspectionCollisionSchema = v.strictObject({
  candidates: v.array(commandInspectionCollisionCandidateSchema),
  name: v.string(),
  winner: commandInspectionCollisionCandidateSchema,
})

export const commandCatalogInspectionResponseSchema = v.strictObject({
  collisions: v.array(commandInspectionCollisionSchema),
  commands: v.array(commandInspectionSnapshotSchema),
  diagnostics: v.array(commandInspectionDiagnosticSchema),
  digest: commandDigestSchema,
  projectId: v.union([projectIdSchema, projectDiscoveryIdSchema]),
  roots: v.array(commandInspectionRootSchema),
  version: v.literal(1),
})

export type CommandCatalogInspectionResponse = v.InferOutput<typeof commandCatalogInspectionResponseSchema>
