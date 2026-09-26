import * as v from "valibot"
import { agentInstructionDiscoveryLimits } from "../agentInstructionDiscoveryLimits.js"
import { agentInstructionSnapshotEntrySchema } from "./agentInstructionSnapshotEntrySchema.js"

export const agentInstructionsResolvedSnapshotSchema = v.pipe(
  v.strictObject({
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

export type AgentInstructionsResolvedSnapshot = v.InferOutput<typeof agentInstructionsResolvedSnapshotSchema>
