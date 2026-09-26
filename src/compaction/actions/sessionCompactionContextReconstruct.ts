import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { messageLoadDurableHistory } from "../../message/actions/messageLoadDurableHistory.js"
import type { messageTable } from "../../message/db/messageTable.js"
import { compactionContextSelect } from "../compactionContextSelect.js"
import type { CompactionMessage } from "../compactionMessage.js"
import { compactionTokenUsageResolve } from "../compactionTokenUsageResolve.js"
import { sessionCompactionTable } from "../db/sessionCompactionTable.js"
import { sessionCompactionLoadLatestSuccessful } from "./sessionCompactionLoadLatestSuccessful.js"

type SessionCompactionContextReconstructResult = {
  compaction: typeof sessionCompactionTable.$inferSelect | undefined
  durableHistory: Array<typeof messageTable.$inferSelect>
  history: Array<CompactionMessage>
}

function sessionCompactionHistoryResolve(
  messages: readonly (typeof messageTable.$inferSelect)[],
  compaction: typeof sessionCompactionTable.$inferSelect | undefined,
): Array<CompactionMessage> {
  return messages.map((message) => {
    const usage =
      message.role === "assistant" &&
      (compaction === undefined || message.createdAt > (compaction.completedAt ?? compaction.startedAt))
        ? compactionTokenUsageResolve(message.metadata)
        : undefined
    return usage === undefined
      ? (message as unknown as CompactionMessage)
      : ({ ...message, reportedUsage: usage } as unknown as CompactionMessage)
  })
}

export async function sessionCompactionContextReconstruct(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  sessionId: string,
): Promise<Result<SessionCompactionContextReconstructResult>> {
  const op = "sessionCompactionContextReconstruct"
  const durableHistory = await messageLoadDurableHistory(database, userId, sessionId)
  if (!durableHistory.success) return createResultError(op, durableHistory.errorMessage)

  const latest = await sessionCompactionLoadLatestSuccessful(database, userId, organizationId, sessionId)
  if (!latest.success) return createResultError(op, latest.errorMessage)
  const compaction = latest.data
  if (compaction === undefined)
    return createResult({
      compaction: undefined,
      durableHistory: durableHistory.data,
      history: sessionCompactionHistoryResolve(durableHistory.data, undefined),
    })

  const tail = durableHistory.data.filter((message) => message.sequence > compaction.coveredSequence)
  const selected = compactionContextSelect({
    messages: tail as unknown as CompactionMessage[],
    // The persisted boundary already defines the retained tail; reconstruction must not cut it again.
    recentTokenBudget: Number.MAX_SAFE_INTEGER,
    summary: compaction.summary ?? undefined,
  })
  if (!selected.success) return createResultError(op, selected.errorMessage)

  return createResult({
    compaction,
    durableHistory: durableHistory.data,
    history: sessionCompactionHistoryResolve(selected.data.context as (typeof messageTable.$inferSelect)[], compaction),
  })
}
