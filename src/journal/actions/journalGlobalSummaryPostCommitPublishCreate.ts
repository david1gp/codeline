import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GlobalSummarySseFrame } from "../../stream/api/globalSummarySseFrameSchema.js"
import type { journalEventTable } from "../db/journalEventTable.js"
import type { JournalCursorCodec } from "./journalCursorCodecCreate.js"
import { journalGlobalSummaryEventFrameCreate } from "./journalGlobalSummaryEventFrameCreate.js"

type JournalGlobalSummaryPostCommitEvent = typeof journalEventTable.$inferSelect
type JournalGlobalSummaryCursorCodec = {
  encodeGlobalSequence?: NonNullable<JournalCursorCodec["encodeGlobalSequence"]>
}

type JournalGlobalSummaryPostCommitPublishCreateDependencies = {
  cursorCodec: JournalGlobalSummaryCursorCodec
  liveSubscription: {
    globalSummaryPublish: (userId: string, event: GlobalSummarySseFrame) => void
  }
}

const journalGlobalSummaryPublishedEventTypes = [
  "input-needed",
  "invalidate",
  "run-cancelled",
  "run-completed",
  "run-failed",
  "run-interrupted",
  "run-started",
  "reset",
] as const

function journalGlobalSummaryCursorEncode(
  cursorCodec: JournalGlobalSummaryPostCommitPublishCreateDependencies["cursorCodec"],
  journalId: unknown,
  globalSequence: unknown,
): Result<string> {
  if (typeof cursorCodec.encodeGlobalSequence !== "function")
    return createResultError("journalGlobalSummaryPostCommitPublish", "The global summary cursor codec is required.")
  return cursorCodec.encodeGlobalSequence(journalId, globalSequence)
}

export function journalGlobalSummaryPostCommitPublishCreate(
  dependencies: JournalGlobalSummaryPostCommitPublishCreateDependencies,
) {
  return async (events: readonly JournalGlobalSummaryPostCommitEvent[]): Promise<Result<void>> => {
    const op = "journalGlobalSummaryPostCommitPublish"
    const frames: Array<{ frame: GlobalSummarySseFrame; userId: string }> = []

    for (const event of events) {
      if (
        !journalGlobalSummaryPublishedEventTypes.includes(
          event.eventType as (typeof journalGlobalSummaryPublishedEventTypes)[number],
        )
      )
        continue
      const frame = journalGlobalSummaryEventFrameCreate(
        {
          cursorEncode: (journalId, globalSequence) =>
            journalGlobalSummaryCursorEncode(dependencies.cursorCodec, journalId, globalSequence),
        },
        event.userId,
        { ...event, globalSequence: event.sequence },
      )
      if (!frame.success) return createResultError(op, frame.errorMessage)
      frames.push({ frame: frame.data, userId: event.userId })
    }

    for (const { frame, userId } of frames) dependencies.liveSubscription.globalSummaryPublish(userId, frame)
    return createResult(undefined)
  }
}
