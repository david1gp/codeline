import { noteGroupsDerive } from "../../note/ui/noteGroupsDerive.js"
import type { NotesScreenView } from "../../note/ui/notesScreenView.js"
import { demoNoteProjectsFixture } from "./demoNoteProjectsFixture.js"
import { demoNotesFixture } from "./demoNotesFixture.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

export function demoNotesScreenStateCreate(variant: () => DemoSessionScreenVariant): NotesScreenView {
  const notes = () => (variant() === "empty" ? [] : demoNotesFixture)

  return {
    groups: () => noteGroupsDerive(notes(), demoNoteProjectsFixture),
    isEmpty: () => notes().length === 0,
    isError: () => variant() === "error",
    isLoading: () => variant() === "loading",
    refresh: () => {},
    revalidate: () => {},
    retry: () => {},
  }
}
