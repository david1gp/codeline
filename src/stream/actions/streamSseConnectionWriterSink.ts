export type StreamSseConnectionWriterSink = {
  abort: (reason?: unknown) => Promise<void> | void
  close: () => Promise<void> | void
  write: (chunk: Uint8Array) => Promise<void>
}
