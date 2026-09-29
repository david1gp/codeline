import type { SessionSidebarNewMode } from "./sessionSidebarNewModeSchema.js"
import { sessionSidebarNewModeStorageKey } from "./sessionSidebarNewModeStorageKey.js"

export function sessionSidebarNewModeWrite(mode: SessionSidebarNewMode, storage?: Pick<Storage, "setItem">): void {
  try {
    const resolvedStorage = storage ?? globalThis.localStorage
    resolvedStorage?.setItem(sessionSidebarNewModeStorageKey, mode)
  } catch (_error: unknown) {
    // Keep the in-memory preference when browser storage is unavailable.
  }
}
