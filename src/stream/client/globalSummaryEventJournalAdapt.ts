import type { GlobalSummaryEvent } from "../schema/globalSummaryEventSchema.js"

export function globalSummaryEventJournalAdapt(event: GlobalSummaryEvent): unknown {
  if (event.eventType === "reset") {
    return {
      asOfSequence: event.globalSequence,
      eventType: event.eventType,
      id: event.id,
      reason: event.reason,
      sequence: event.globalSequence,
    }
  }
  if (event.eventType === "input-needed") {
    return {
      eventType: "invalidate",
      id: event.id,
      resourceId: event.sessionId,
      resourceType: "session",
      revision: event.sessionRevision,
      sequence: event.globalSequence,
    }
  }
  const { globalSequence, ...values } = event
  return { ...values, sequence: globalSequence }
}
