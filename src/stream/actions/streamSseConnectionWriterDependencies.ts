import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import type { SessionDetailSseFrame } from "../../session/api/sessionDetailSseFrameSchema.js"
import type { GlobalSummarySseFrame } from "../api/globalSummarySseFrameSchema.js"
import type { StreamSseConnectionWriterScheduler } from "./streamSseConnectionWriterScheduler.js"
import type { StreamSseConnectionWriterSink } from "./streamSseConnectionWriterSink.js"
import type { StreamSseConnectionWriterSource } from "./streamSseConnectionWriterSource.js"

type StreamSseConnectionWriterEvent = GlobalSummarySseFrame | SessionDetailSseFrame

export type StreamSseConnectionWriterDependencies = {
  baselineSequence: number
  baselineGlobalSequence?: number
  now: () => number
  sequenceKind: "global-summary" | "session-detail"
  scheduler: StreamSseConnectionWriterScheduler
  subscription: StreamSseConnectionWriterSource<StreamSseConnectionWriterEvent>
  userId: string
  writer: StreamSseConnectionWriterSink
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
}
