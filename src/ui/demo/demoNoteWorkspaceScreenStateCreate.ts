import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"
import { noteGroupsDerive } from "../../note/ui/noteGroupsDerive.js"
import { noteMoveBoundsResolve } from "../../note/ui/noteMoveBoundsResolve.js"
import type { NoteWorkspaceScreenView } from "../../note/ui/noteWorkspaceScreenView.js"
import { demoNoteProjectsFixture } from "./demoNoteProjectsFixture.js"
import { demoNotesFixture } from "./demoNotesFixture.js"
import { demoNoteScreenStateCreate } from "./demoNoteScreenStateCreate.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const demoActiveNote = demoNotesFixture[0]

export function demoNoteWorkspaceScreenStateCreate(variant: () => DemoSessionScreenVariant): NoteWorkspaceScreenView {
  const detail = demoNoteScreenStateCreate(variant)
  const notes = () => (variant() === "empty" ? [] : demoNotesFixture)
  const groups = () => noteGroupsDerive(notes(), demoNoteProjectsFixture)
  const projectNotes = () => groups().find((group) => group.projectPath === demoActiveNote.projectPath)?.notes ?? []
  const bounds = () => noteMoveBoundsResolve(projectNotes(), demoActiveNote.id)

  return {
    detail,
    sidebar: {
      activeNoteId: () => demoActiveNote.id,
      activeProjectPath: () => demoActiveNote.projectPath,
      canMoveDown: () => bounds().canMoveDown,
      canMoveUp: () => bounds().canMoveUp,
      groups,
      isError: () => variant() === "error",
      isLoading: () => variant() === "loading",
      isPreviewEmpty: () => detail.content().trim() === "",
      noteMoveDown: () => {},
      noteMoveUp: () => {},
      previewHtml: () => markdownHtmlRender(detail.content()),
      retry: () => {},
    },
  }
}
