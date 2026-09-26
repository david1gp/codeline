import type { StreamEventSource } from "./streamEventSource.js"
import type { StreamEventSourceError } from "./streamEventSourceError.js"
import type { StreamEventSourceEvent } from "./streamEventSourceEvent.js"

type StreamEventSourceListener = (event: StreamEventSourceEvent) => void

export function streamEventSourceCreate(url: string, options: { withCredentials: boolean }): StreamEventSource {
  const nativeSource = new EventSource(url, options)
  const nativeListeners = new Map<string, Map<StreamEventSourceListener, EventListener>>()
  let onerror: ((error?: StreamEventSourceError) => void) | null = null
  let onopen: (() => void) | null = null

  const source: StreamEventSource = {
    get readyState() {
      return nativeSource.readyState
    },
    addEventListener: (type, listener) => {
      const listeners = nativeListeners.get(type) ?? new Map<StreamEventSourceListener, EventListener>()
      if (listeners.has(listener)) return
      const nativeListener: EventListener = (event) => {
        const message = event as MessageEvent<unknown>
        listener({ data: message.data, lastEventId: message.lastEventId })
      }
      nativeSource.addEventListener(type, nativeListener)
      listeners.set(listener, nativeListener)
      nativeListeners.set(type, listeners)
    },
    close: () => nativeSource.close(),
    get onerror() {
      return onerror
    },
    set onerror(handler) {
      onerror = handler
      nativeSource.onerror =
        handler === null
          ? null
          : (event) => {
              const candidate = event as Event & { status?: unknown }
              const status = typeof candidate.status === "number" ? candidate.status : undefined
              handler(status === undefined ? {} : { status })
            }
    },
    get onopen() {
      return onopen
    },
    set onopen(handler) {
      onopen = handler
      nativeSource.onopen = handler === null ? null : () => handler()
    },
    removeEventListener: (type, listener) => {
      const listeners = nativeListeners.get(type)
      if (listeners === undefined) return
      const nativeListener = listeners.get(listener)
      if (nativeListener === undefined) return
      nativeSource.removeEventListener(type, nativeListener)
      listeners.delete(listener)
      if (listeners.size === 0) nativeListeners.delete(type)
    },
  }
  return source
}
