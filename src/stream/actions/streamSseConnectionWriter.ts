import type { Result } from "@adaptive-ds/result"
import type { SessionDetailSseFrame } from "../../session/api/sessionDetailSseFrameSchema.js"
import type { GlobalSummarySseFrame } from "../api/globalSummarySseFrameSchema.js"

type StreamSseConnectionWriterEvent = GlobalSummarySseFrame | SessionDetailSseFrame

export type StreamSseConnectionWriter = {
  close: () => Promise<void>
  completeBacklog: () => Result<void>
  connect: () => Result<void>
  disconnect: (reason?: string) => Promise<void>
  enqueueBacklog: (events: readonly StreamSseConnectionWriterEvent[]) => Promise<Result<void>>
  isDisconnected: () => boolean
  maximumReplayStagingByteCount: () => number
  maximumReplayStagingEventCount: () => number
  queuedByteCount: () => number
  queuedEventCount: () => number
  queuedReplayByteCount: () => number
  queuedReplayEventCount: () => number
  setReplayUpperBound: (upperBound: number) => Result<void>
  waitForIdle: () => Promise<void>
}
