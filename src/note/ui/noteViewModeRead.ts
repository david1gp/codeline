import * as v from "valibot"
import { type NoteViewMode, noteViewModeSchema } from "./noteViewModeSchema.js"
import { noteViewModeStorageKey } from "./noteViewModeStorageKey.js"

export function noteViewModeRead(): NoteViewMode {
  try {
    const stored = globalThis.localStorage?.getItem(noteViewModeStorageKey)
    const parsed = v.safeParse(noteViewModeSchema, stored)
    return parsed.success ? parsed.output : "edit"
  } catch (_error: unknown) {
    return "edit"
  }
}
