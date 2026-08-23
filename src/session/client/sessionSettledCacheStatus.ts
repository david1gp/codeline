/** Lifecycle of one cached settled-session record as seen by the rendering UI. */
export type SessionSettledCacheStatus = "error" | "loading" | "offline" | "ready" | "revalidating"
