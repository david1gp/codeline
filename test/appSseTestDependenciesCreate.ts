import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import type { JournalCursorCodec } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalPostCommitPublishCreate } from "../src/journal/actions/journalPostCommitPublishCreate.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import { streamSseSchedulerCreate } from "../src/stream/actions/streamSseSchedulerCreate.js"

export function appSseTestDependenciesCreate(cursorCodec: JournalCursorCodec) {
  const liveSubscription = streamLiveSubscriptionCreate()

  return {
    journalBacklogRead,
    journalPostCommitPublish: journalPostCommitPublishCreate({ cursorCodec, liveSubscription }),
    metricsCollector: metricsCollectorCreate(),
    streamLiveSubscription: liveSubscription,
    streamSseConnectionWriterCreate,
    streamSseNow: Date.now,
    streamSseScheduler: streamSseSchedulerCreate(),
  }
}
