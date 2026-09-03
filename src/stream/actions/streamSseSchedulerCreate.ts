import type { StreamSseConnectionWriterScheduler } from "./streamSseConnectionWriterScheduler.js"

export function streamSseSchedulerCreate(): StreamSseConnectionWriterScheduler {
  return {
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    setInterval: (handler, timeoutMs) => setInterval(handler, timeoutMs),
    setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
  }
}
