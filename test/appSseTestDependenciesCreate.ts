import type { JournalCursorCodec } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalGlobalSummaryBacklogRead } from "../src/journal/actions/journalGlobalSummaryBacklogRead.js"
import { journalGlobalSummaryPostCommitPublishCreate } from "../src/journal/actions/journalGlobalSummaryPostCommitPublishCreate.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import { streamSseSchedulerCreate } from "../src/stream/actions/streamSseSchedulerCreate.js"

export function appSseTestDependenciesCreate(cursorCodec: JournalCursorCodec) {
  const liveSubscription = streamLiveSubscriptionCreate()

  return {
    globalSummaryLiveSubscription: liveSubscription,
    journalGlobalSummaryBacklogRead,
    journalPostCommitPublish: journalGlobalSummaryPostCommitPublishCreate({
      cursorCodec,
      liveSubscription,
    }),
    metricsCollector: metricsCollectorCreate(),
    streamLiveSubscription: liveSubscription,
    streamSseConnectionWriterCreate,
    streamSseNow: Date.now,
    streamSseScheduler: streamSseSchedulerCreate(),
  }
}
