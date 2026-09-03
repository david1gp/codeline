import type { StreamEventSourceError } from "./streamEventSourceError.js"
import type { StreamEventSourceEvent } from "./streamEventSourceEvent.js"

type StreamEventSourceListener = (event: StreamEventSourceEvent) => void
type StreamEventSourceErrorHandler = (error?: StreamEventSourceError) => void
type StreamEventSourceOpenHandler = () => void

export type StreamEventSource = {
  readonly readyState?: number
  addEventListener: (type: string, listener: StreamEventSourceListener) => void
  close: () => void
  onerror: StreamEventSourceErrorHandler | null
  onopen: StreamEventSourceOpenHandler | null
  removeEventListener: (type: string, listener: StreamEventSourceListener) => void
}
