/** Lifecycle of one bounded session cache snapshot as seen by the rendering UI. */
export type SessionCacheStatus = "error" | "loading" | "offline" | "ready" | "revalidating"
