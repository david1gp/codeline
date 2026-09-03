import type { StreamSseConnectionWriterSink } from "./streamSseConnectionWriterSink.js"

export type StreamSseConnectionWriterSinkFactory = (
  outputWriter: WritableStreamDefaultWriter<Uint8Array>,
) => StreamSseConnectionWriterSink
