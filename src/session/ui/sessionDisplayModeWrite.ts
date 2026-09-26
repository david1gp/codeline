import type { SessionDisplayMode } from "./sessionDisplayModeSchema.js"
import { sessionDisplayModeStorageKey } from "./sessionDisplayModeStorageKey.js"

export function sessionDisplayModeWrite(mode: SessionDisplayMode) {
  try {
    globalThis.localStorage?.setItem(sessionDisplayModeStorageKey, mode)
  } catch (_error: unknown) {
    // Storage is unavailable; the mode stays in memory only.
  }
}
