import { createResult, type Result } from "@adaptive-ds/result"
import type { journalEventTable } from "../db/journalEventTable.js"
import type { journalEventsPruneSchedulerCreate } from "./journalEventsPruneSchedulerCreate.js"

type JournalPostCommitEvent = typeof journalEventTable.$inferSelect
type JournalPostCommitPublish = ((events: readonly JournalPostCommitEvent[]) => Promise<Result<void>>) & {
  schedulePrune?: (userIds: readonly string[]) => void
}

type JournalPostCommitPublishCreateDependencies = {
  globalSummaryPostCommitPublish: JournalPostCommitPublish
  pruneScheduler?: ReturnType<typeof journalEventsPruneSchedulerCreate>
  selectedSessionDetailPostCommitPublish: JournalPostCommitPublish
}

export function journalPostCommitPublishCreate(dependencies: JournalPostCommitPublishCreateDependencies) {
  const publish: JournalPostCommitPublish = async (
    events: readonly JournalPostCommitEvent[],
  ): Promise<Result<void>> => {
    const selectedSessionDetailPublished = await dependencies.selectedSessionDetailPostCommitPublish(events)
    if (!selectedSessionDetailPublished.success) return selectedSessionDetailPublished
    const globalSummaryPublished = await dependencies.globalSummaryPostCommitPublish(events)
    if (!globalSummaryPublished.success) return globalSummaryPublished
    return createResult(undefined)
  }
  if (dependencies.pruneScheduler !== undefined) publish.schedulePrune = dependencies.pruneScheduler.schedule
  return publish
}
