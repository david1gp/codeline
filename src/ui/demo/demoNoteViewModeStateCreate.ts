import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import type { NoteViewMode } from "../../note/ui/noteViewModeSchema.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

/** Keeps the view mode in memory so specimens never touch localStorage. */
export function demoNoteViewModeStateCreate(variant: () => DemoSessionScreenVariant) {
  const mode = createSignalObject<NoteViewMode>(variant() === "editing" ? "edit" : "split")

  return {
    viewMode: mode.get,
    viewModeSelect: (value: NoteViewMode) => mode.set(value),
  }
}
