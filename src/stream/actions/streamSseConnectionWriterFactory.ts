import type { StreamSseConnectionWriter } from "./streamSseConnectionWriter.js"
import type { StreamSseConnectionWriterDependencies } from "./streamSseConnectionWriterDependencies.js"

export type StreamSseConnectionWriterFactory = (
  dependencies: StreamSseConnectionWriterDependencies,
) => StreamSseConnectionWriter
