import { createSignal } from "solid-js/dist/solid.js"
import { noteViewModeRead } from "./noteViewModeRead.js"
import type { NoteViewMode } from "./noteViewModeSchema.js"
import { noteViewModeWrite } from "./noteViewModeWrite.js"

export function noteViewModeStateCreate() {
  const [mode, modeSet] = createSignal<NoteViewMode>(noteViewModeRead())

  return {
    viewMode: mode,
    viewModeSelect: (value: NoteViewMode) => {
      modeSet(value)
      noteViewModeWrite(value)
    },
  }
}
