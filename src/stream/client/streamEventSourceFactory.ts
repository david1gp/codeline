import type { StreamEventSource } from "./streamEventSource.js"

export type StreamEventSourceFactory = (url: string, options: { withCredentials: boolean }) => StreamEventSource
