import type { NoteViewMode } from "./noteViewModeSchema.js"
import { noteViewModeStorageKey } from "./noteViewModeStorageKey.js"

export function noteViewModeWrite(mode: NoteViewMode) {
  try {
    globalThis.localStorage?.setItem(noteViewModeStorageKey, mode)
  } catch (_error: unknown) {
    // Storage is unavailable; the mode stays in-memory only.
  }
}
