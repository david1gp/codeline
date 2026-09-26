import type { StreamSseConnectionWriterSink } from "./streamSseConnectionWriterSink.js"

export function streamSseConnectionWriterSinkCreate(
  outputWriter: WritableStreamDefaultWriter<Uint8Array>,
): StreamSseConnectionWriterSink {
  return {
    abort: (reason) => outputWriter.abort(reason),
    close: () => outputWriter.close(),
    write: (chunk) => outputWriter.write(chunk),
  }
}
