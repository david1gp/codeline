import { createHash } from "node:crypto"
import * as path from "node:path"
import * as v from "valibot"
import { agentInstructionDiscoveryLimits } from "../agentInstructionDiscoveryLimits.js"

const agentInstructionAbsolutePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)
const agentInstructionScopeSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4_096))
const agentInstructionSourceSchema = v.picklist(["global", "project"])
const agentInstructionPrecedenceSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)

const agentInstructionByteSizeSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)

const agentInstructionValidationCodeSchema = v.picklist([
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

const agentInstructionValidationDiagnosticSchema = v.strictObject({
  code: agentInstructionValidationCodeSchema,
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  path: agentInstructionAbsolutePathSchema,
  precedence: agentInstructionPrecedenceSchema,
  scope: agentInstructionScopeSchema,
  source: agentInstructionSourceSchema,
})

const agentInstructionSnapshotEntrySchema = v.pipe(
  v.strictObject({
    canonicalPath: agentInstructionAbsolutePathSchema,
    content: v.pipe(
      v.string(),
      v.check((value) => Buffer.byteLength(value, "utf8") <= agentInstructionDiscoveryLimits.maximumFileBytes),
    ),
    digest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
    precedence: agentInstructionPrecedenceSchema,
    scope: agentInstructionScopeSchema,
    size: agentInstructionByteSizeSchema,
    source: agentInstructionSourceSchema,
  }),
  v.check(({ content, size }) => Buffer.byteLength(content, "utf8") === size),
  v.check(({ content, digest }) => digest === `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`),
)

export const agentInstructionSnapshotSchema = v.pipe(
  v.strictObject({
    diagnostics: v.pipe(
      v.array(agentInstructionValidationDiagnosticSchema),
      v.maxLength(agentInstructionDiscoveryLimits.maximumDiagnostics),
    ),
    snapshots: v.pipe(
      v.array(agentInstructionSnapshotEntrySchema),
      v.maxLength(agentInstructionDiscoveryLimits.maximumSnapshots),
    ),
    version: v.literal(1),
  }),
  v.check(({ snapshots }) => new Set(snapshots.map(({ canonicalPath }) => canonicalPath)).size === snapshots.length),
  v.check(
    ({ snapshots }) =>
      snapshots.reduce((total, snapshot) => total + snapshot.size, 0) <=
      agentInstructionDiscoveryLimits.maximumTotalBytes,
  ),
)

export type AgentInstructionSnapshot = v.InferOutput<typeof agentInstructionSnapshotSchema>
