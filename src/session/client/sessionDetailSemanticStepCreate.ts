import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { SessionDetailEvent } from "../api/sessionDetailEventSchema.js"
import { sessionChildReferenceSchema } from "../api/sessionChildReferenceSchema.js"
import { type SessionSemanticStep, sessionSemanticStepSchema } from "../api/sessionSemanticStepSchema.js"

type SessionDetailEntryEvent = Extract<SessionDetailEvent, { eventType: "entry" }>

function sessionDetailPayloadRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function sessionDetailSummaryResolve(payload: Record<string, unknown>, event: SessionDetailEntryEvent): string {
  if (typeof payload.summary === "string") return payload.summary.slice(0, 16_384)
  if (event.kind === "message" && typeof payload.content === "string") return payload.content.slice(0, 16_384)
  if (event.kind === "run" && typeof payload.status === "string") return `Run ${payload.status}`
  if (event.kind === "tool" && typeof payload.toolName === "string") return payload.toolName.slice(0, 16_384)
  return ""
}

function sessionDetailChildReferenceCreate(payload: Record<string, unknown>): unknown {
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

export function sessionDetailSemanticStepCreate(event: SessionDetailEntryEvent): Result<SessionSemanticStep> {
  const op = "sessionDetailSemanticStepCreate"
  const payload = sessionDetailPayloadRecord(event.payload)
  if (payload === undefined) return createResultError(op, "The selected-session entry payload is invalid.")
  const base = {
    id: event.entryId,
    sequence: event.position,
    summary: sessionDetailSummaryResolve(payload, event),
  }
  let step: unknown
  if (event.kind === "message") {
    step = { ...base, kind: "message", role: payload.role }
  } else if (event.kind === "run") {
    step = {
      ...base,
      detailId: typeof payload.detailId === "string" ? payload.detailId : event.sourceId,
      kind: "run",
      status: payload.status,
      ...(typeof payload.terminalKind === "string" ? { terminalKind: payload.terminalKind } : {}),
    }
  } else {
    const childReference = sessionDetailChildReferenceCreate(payload)
    step = {
      ...base,
      ...(childReference === undefined ? {} : { childReference }),
      detailId: typeof payload.detailId === "string" ? payload.detailId : event.sourceDetailId,
      kind: "tool",
      runId: typeof payload.runId === "string" ? payload.runId : event.sourceId,
    }
  }

  const parsed = v.safeParse(sessionSemanticStepSchema, step)
  if (!parsed.success) return createResultError(op, "The selected-session entry projection is invalid.")
  return createResult(parsed.output)
}
