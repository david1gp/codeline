import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { AgentInstructionSnapshotEntry } from "../schema/agentInstructionSnapshotEntrySchema.js"
import { agentInstructionSnapshotSchema } from "../schema/agentInstructionSnapshotSchema.js"
import {
  type AgentInstructionsResolvedSnapshot,
  agentInstructionsResolvedSnapshotSchema,
} from "../schema/agentInstructionsResolvedSnapshotSchema.js"

function agentInstructionsSnapshotPathSort(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function agentInstructionsSnapshotEntrySort(
  left: AgentInstructionSnapshotEntry,
  right: AgentInstructionSnapshotEntry,
): number {
  const leftSource = left.source === "global" ? 0 : 1
  const rightSource = right.source === "global" ? 0 : 1
  if (leftSource !== rightSource) return leftSource - rightSource
  if (left.precedence !== right.precedence) return left.precedence - right.precedence
  return agentInstructionsSnapshotPathSort(left.canonicalPath, right.canonicalPath)
}

function agentInstructionsSnapshotDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value

  Object.freeze(value)
  for (const child of Object.values(value)) agentInstructionsSnapshotDeepFreeze(child)
  return value
}

export function agentInstructionsSnapshotResolve(input: unknown): Result<AgentInstructionsResolvedSnapshot> {
  const op = "agentInstructionsSnapshotResolve"
  const discovered = v.safeParse(agentInstructionSnapshotSchema, input)
  const resolved = v.safeParse(agentInstructionsResolvedSnapshotSchema, input)
  if (!discovered.success && !resolved.success)
    return createResultError(op, "The discovered agent instruction snapshot is invalid.")

  const sourceEntries = discovered.success
    ? discovered.output.snapshots
    : resolved.success
      ? resolved.output.snapshots
      : []
  const entries = [...sourceEntries].sort(agentInstructionsSnapshotEntrySort)
  const parsed = v.safeParse(agentInstructionsResolvedSnapshotSchema, {
    snapshots: entries,
    version: 1,
  })
  if (!parsed.success) return createResultError(op, "The resolved agent instruction snapshot is invalid.")

  return createResult(agentInstructionsSnapshotDeepFreeze(structuredClone(parsed.output)))
}
