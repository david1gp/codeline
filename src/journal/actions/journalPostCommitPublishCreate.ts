import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { StreamSseFrame } from "../../stream/api/streamSseFrameSchema.js"
import type { journalEventTable } from "../db/journalEventTable.js"
import { journalBacklogEventFrameCreate } from "./journalBacklogEventFrameCreate.js"
import type { JournalCursorCodec } from "./journalCursorCodecCreate.js"

type JournalPostCommitEvent = typeof journalEventTable.$inferSelect

type JournalPostCommitPublishCreateDependencies = {
  cursorCodec: Pick<JournalCursorCodec, "encode">
  liveSubscription: {
    publish: (userId: string, event: StreamSseFrame) => void
  }
}

export function journalPostCommitPublishCreate(dependencies: JournalPostCommitPublishCreateDependencies) {
  return async (events: readonly JournalPostCommitEvent[]): Promise<Result<void>> => {
    const op = "journalPostCommitPublish"
    const frames: Array<{ frame: StreamSseFrame; userId: string }> = []

    for (const event of events) {
      const frame = journalBacklogEventFrameCreate(
        { cursorEncode: dependencies.cursorCodec.encode },
        event.userId,
        event,
      )
      if (!frame.success) return createResultError(op, frame.errorMessage)
      frames.push({ frame: frame.data, userId: event.userId })
    }

    for (const { frame, userId } of frames) dependencies.liveSubscription.publish(userId, frame)
    return createResult(undefined)
  }
}
