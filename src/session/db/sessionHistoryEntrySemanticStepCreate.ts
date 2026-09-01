import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { sessionChildReferenceSchema } from "../api/sessionChildReferenceSchema.js"
import { type SessionSemanticStep, sessionSemanticStepSchema } from "../api/sessionSemanticStepSchema.js"
import { sessionHistoryEntryTable } from "./sessionHistoryEntryTable.js"

const sessionHistoryEntrySummarySchema = v.pipe(v.string(), v.maxLength(16_384))

type SessionHistoryEntry = typeof sessionHistoryEntryTable.$inferSelect

function sessionHistoryEntryPayloadRecordCreate(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function sessionHistoryEntrySummaryCreate(payload: Record<string, unknown>, kind: SessionHistoryEntry["kind"]): string {
  if (typeof payload.summary === "string") return payload.summary.slice(0, 16_384)
  if (kind === "message" && typeof payload.content === "string") return payload.content.slice(0, 16_384)
  if (kind === "run" && typeof payload.status === "string") return `Run ${payload.status}`
  if (kind === "tool" && typeof payload.toolName === "string") return payload.toolName.slice(0, 16_384)
  return ""
}

function sessionHistoryEntryChildReferenceCreate(payload: Record<string, unknown>): unknown {
  const candidate =
    payload.childReference !== null &&
    typeof payload.childReference === "object" &&
    !Array.isArray(payload.childReference)
      ? payload.childReference
      : {
          childRunId: payload.childRunId,
          childSessionId: payload.childSessionId,
          delegationId: payload.delegationId,
          parentSessionId: payload.parentSessionId,
        }
  return v.safeParse(sessionChildReferenceSchema, candidate).success ? candidate : undefined
}

export function sessionHistoryEntrySemanticStepCreate(entry: SessionHistoryEntry): Result<SessionSemanticStep> {
  const op = "sessionHistoryEntrySemanticStepCreate"
  const payload = sessionHistoryEntryPayloadRecordCreate(entry.payload)
  if (payload === undefined) return createResultError(op, "The persisted session history entry payload is invalid.")

  const summary = v.safeParse(sessionHistoryEntrySummarySchema, sessionHistoryEntrySummaryCreate(payload, entry.kind))
  if (!summary.success) return createResultError(op, "The persisted session history entry summary is invalid.")

  const base = {
    id: entry.id,
    sequence: entry.position,
    summary: summary.output,
  }
  let step: unknown
  if (entry.kind === "message") {
    step = { ...base, kind: "message", role: payload.role }
  } else if (entry.kind === "run") {
    step = {
      ...base,
      detailId: typeof payload.detailId === "string" ? payload.detailId : entry.sourceId,
      kind: "run",
      status: payload.status,
      ...(typeof payload.terminalKind === "string" ? { terminalKind: payload.terminalKind } : {}),
    }
  } else {
    const childReference = sessionHistoryEntryChildReferenceCreate(payload)
    step = {
      ...base,
      ...(childReference === undefined ? {} : { childReference }),
      detailId: typeof payload.detailId === "string" ? payload.detailId : entry.sourceDetailId,
      kind: "tool",
      runId: typeof payload.runId === "string" ? payload.runId : entry.sourceId,
    }
  }

  const parsed = v.safeParse(sessionSemanticStepSchema, step)
  if (!parsed.success) return createResultError(op, "The persisted session history entry is invalid.")
  return createResult(parsed.output)
}
