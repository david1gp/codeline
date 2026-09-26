import { createHash } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { sessionInstructionOverridesSchema } from "../../session/schema/sessionInstructionOverridesSchema.js"
import type { AgentInstructionsResolvedSnapshot } from "../schema/agentInstructionsResolvedSnapshotSchema.js"
import { agentInstructionsSnapshotResolve } from "./agentInstructionsSnapshotResolve.js"

export function agentInstructionsSnapshotOverrideApply(input: {
  overrides?: unknown
  snapshot: unknown
}): Result<AgentInstructionsResolvedSnapshot> {
  const op = "agentInstructionsSnapshotOverrideApply"
  const snapshot = agentInstructionsSnapshotResolve(input.snapshot)
  if (!snapshot.success) return createResultError(op, "The discovered agent instruction snapshot is invalid.")
  if (input.overrides === undefined) return snapshot

  const overrides = v.safeParse(sessionInstructionOverridesSchema, input.overrides)
  if (!overrides.success) return createResultError(op, "The session instruction overrides are invalid.")

  const discoveredPaths = new Set(snapshot.data.snapshots.map(({ canonicalPath }) => canonicalPath))
  for (const canonicalPath of Object.keys(overrides.output)) {
    if (!discoveredPaths.has(canonicalPath))
      return createResultError(op, "The instruction override path is not a discovered AGENTS.md path.")
  }

  const effective = {
    snapshots: snapshot.data.snapshots.map((entry) => {
      const content = overrides.output[entry.canonicalPath]
      if (content === undefined) return entry
      return {
        ...entry,
        content,
        digest: `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`,
        size: Buffer.byteLength(content, "utf8"),
      }
    }),
    version: 1 as const,
  }
  const resolved = agentInstructionsSnapshotResolve(effective)
  if (!resolved.success)
    return createResultError(op, "The instruction overrides exceed the agent instruction snapshot limits.")
  return resolved
}
