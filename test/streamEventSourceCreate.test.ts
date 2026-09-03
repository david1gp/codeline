import { expect, test } from "bun:test"
import { streamEventSourceCreate } from "../src/stream/client/streamEventSourceCreate.js"
import type { StreamEventSourceEvent } from "../src/stream/client/streamEventSourceEvent.js"

type NativeListener = (event: Event) => void

class FakeNativeEventSource {
  static readonly instances: FakeNativeEventSource[] = []
  readonly listeners = new Map<string, Set<NativeListener>>()
  readonly url: string
  readonly withCredentials: boolean
  closeCount = 0
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = 0

  constructor(url: string, options: { withCredentials: boolean }) {
    this.url = url
    this.withCredentials = options.withCredentials
    FakeNativeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: NativeListener): void {
    const listeners = this.listeners.get(type) ?? new Set<NativeListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  close(): void {
    this.closeCount += 1
    this.readyState = 2
  }

  emit(type: string, data: unknown, lastEventId: string): void {
    const event = { data, lastEventId } as unknown as Event
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
  }

  emitError(): void {
    this.onerror?.({} as Event)
  }

  emitOpen(): void {
    this.readyState = 1
    this.onopen?.({} as Event)
  }

  removeEventListener(type: string, listener: NativeListener): void {
    this.listeners.get(type)?.delete(listener)
  }
}

test("adapts the browser EventSource surface to a narrow source boundary", () => {
  const originalEventSource = globalThis.EventSource
  Object.defineProperty(globalThis, "EventSource", {
    configurable: true,
    value: FakeNativeEventSource,
  })

  try {
    const source = streamEventSourceCreate("/api/events", { withCredentials: true })
    const nativeSource = FakeNativeEventSource.instances[0]
    if (nativeSource === undefined) throw new Error("The native source was not created.")
    const received: StreamEventSourceEvent[] = []
    let opened = 0
    let errored = 0
    const listener = (event: StreamEventSourceEvent) => received.push(event)

    source.onopen = () => {
      opened += 1
    }
    source.onerror = () => {
      errored += 1
    }
    source.addEventListener("entry", listener)
    nativeSource.emitOpen()
    nativeSource.emit("entry", "payload", "cursor-1")
    nativeSource.emitError()

    expect(nativeSource.url).toBe("/api/events")
    expect(nativeSource.withCredentials).toBe(true)
    expect(source.readyState).toBe(1)
    expect(opened).toBe(1)
    expect(errored).toBe(1)
    expect(received).toEqual([{ data: "payload", lastEventId: "cursor-1" }])

    source.removeEventListener("entry", listener)
    nativeSource.emit("entry", "ignored", "cursor-2")
    source.close()
    expect(received).toHaveLength(1)
    expect(nativeSource.closeCount).toBe(1)
  } finally {
    Object.defineProperty(globalThis, "EventSource", {
      configurable: true,
      value: originalEventSource,
    })
  }
})
