export type StreamSseConnectionWriterScheduler = {
  clearInterval: (handle: unknown) => void
  clearTimeout: (handle: unknown) => void
  setInterval: (handler: () => void, timeoutMs: number) => unknown
  setTimeout: (handler: () => void, timeoutMs: number) => unknown
}
