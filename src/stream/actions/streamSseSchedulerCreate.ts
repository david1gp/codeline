import type { streamSseConnectionWriterCreate } from "./streamSseConnectionWriterCreate.js"

export function streamSseSchedulerCreate(): Parameters<typeof streamSseConnectionWriterCreate>[0]["scheduler"] {
  return {
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    setInterval: (handler, timeoutMs) => setInterval(handler, timeoutMs),
    setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
  }
}
