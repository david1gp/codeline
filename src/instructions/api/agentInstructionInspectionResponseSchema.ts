import * as v from "valibot"
import { projectDiscoveryIdSchema } from "../../project/projectDiscoveryIdSchema.js"
import { projectIdSchema } from "../../project/projectIdSchema.js"

const agentInstructionInspectionCanonicalPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)),
)

const agentInstructionInspectionDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))
const agentInstructionInspectionPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..")),
)
const agentInstructionInspectionScopeSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..")),
)
const agentInstructionInspectionSourceSchema = v.picklist(["global", "project"])
const agentInstructionInspectionPrecedenceSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)
const agentInstructionInspectionSizeSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)
const agentInstructionInspectionValidationCodeSchema = v.picklist([
  "binary-content",
  "directory-entry-limit-exceeded",
  "directory-unavailable",
  "file-too-large",
  "file-unavailable",
  "invalid-utf8",
  "not-regular-file",
  "snapshot-limit-exceeded",
  "symbolic-link",
  "total-byte-budget-exceeded",
])

const agentInstructionInspectionSnapshotSchema = v.strictObject({
  canonicalPath: v.optional(agentInstructionInspectionCanonicalPathSchema),
  content: v.optional(v.string()),
  digest: agentInstructionInspectionDigestSchema,
  path: agentInstructionInspectionPathSchema,
  precedence: agentInstructionInspectionPrecedenceSchema,
  scope: agentInstructionInspectionScopeSchema,
  size: agentInstructionInspectionSizeSchema,
  source: agentInstructionInspectionSourceSchema,
  validation: v.literal("valid"),
})

const agentInstructionInspectionDiagnosticSchema = v.strictObject({
  code: agentInstructionInspectionValidationCodeSchema,
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  path: agentInstructionInspectionPathSchema,
  precedence: agentInstructionInspectionPrecedenceSchema,
  scope: agentInstructionInspectionScopeSchema,
  source: agentInstructionInspectionSourceSchema,
  validation: v.literal("invalid"),
})

export const agentInstructionInspectionResponseSchema = v.strictObject({
  diagnostics: v.array(agentInstructionInspectionDiagnosticSchema),
  projectId: v.union([projectIdSchema, projectDiscoveryIdSchema]),
  snapshots: v.array(agentInstructionInspectionSnapshotSchema),
  version: v.literal(1),
})

export type AgentInstructionInspectionResponse = v.InferOutput<typeof agentInstructionInspectionResponseSchema>
