import { createHash } from "node:crypto"
import * as path from "node:path"
import * as v from "valibot"
import { agentInstructionDiscoveryLimits } from "../agentInstructionDiscoveryLimits.js"

const agentInstructionSnapshotEntryDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))
const agentInstructionSnapshotEntryAbsolutePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)
const agentInstructionSnapshotEntryScopeSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4_096))
const agentInstructionSnapshotEntrySourceSchema = v.picklist(["global", "project"])
const agentInstructionSnapshotEntryPrecedenceSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)
const agentInstructionSnapshotEntryByteSizeSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)

export const agentInstructionSnapshotEntrySchema = v.pipe(
  v.strictObject({
    canonicalPath: agentInstructionSnapshotEntryAbsolutePathSchema,
    content: v.pipe(
      v.string(),
      v.check((value) => Buffer.byteLength(value, "utf8") <= agentInstructionDiscoveryLimits.maximumFileBytes),
    ),
    digest: agentInstructionSnapshotEntryDigestSchema,
    precedence: agentInstructionSnapshotEntryPrecedenceSchema,
    scope: agentInstructionSnapshotEntryScopeSchema,
    size: agentInstructionSnapshotEntryByteSizeSchema,
    source: agentInstructionSnapshotEntrySourceSchema,
  }),
  v.check(({ content, size }) => Buffer.byteLength(content, "utf8") === size),
  v.check(({ content, digest }) => digest === `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`),
)

export type AgentInstructionSnapshotEntry = v.InferOutput<typeof agentInstructionSnapshotEntrySchema>
