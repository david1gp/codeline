import { useQuery, useZero } from "@rocicorp/zero/solid"
import type { zeroSchema } from "../../database/zeroSchema.js"
import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"
import { codelineQueries } from "../../ui/codelineQueries.js"
import { type NoteMutationContext, noteMutators } from "../noteMutators.js"
import { type NoteGroupRow, noteGroupsDerive } from "./noteGroupsDerive.js"
import { noteMoveBoundsResolve } from "./noteMoveBoundsResolve.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NoteWorkspaceSidebarView } from "./noteWorkspaceScreenView.js"

type NoteWorkspacePageStateOptions = {
  noteId: () => string
}

export function noteWorkspacePageStateCreate(options: NoteWorkspacePageStateOptions): NoteWorkspaceSidebarView {
  const zero = useZero<typeof zeroSchema, undefined, NoteMutationContext>()
  const [notes, result] = useQuery(() => codelineQueries.notes())
  const projectList = noteProjectListStateCreate()

  const groups = () => noteGroupsDerive(notes(), projectList.projects())
  const activeNote = () =>
    (notes() as readonly (NoteGroupRow & { content: string })[]).find((note) => note.id === options.noteId())
  const activeProjectPath = () => activeNote()?.projectPath ?? null
  const projectNotes = () => groups().find((group) => group.projectPath === activeProjectPath())?.notes ?? []
  const bounds = () => noteMoveBoundsResolve(projectNotes(), options.noteId())

  const noteMove = async (direction: "up" | "down") => {
    const current = activeNote()
    if (current === undefined) return
    if (direction === "up" ? !bounds().canMoveUp : !bounds().canMoveDown) return
    await zero().mutate(noteMutators.note.reorder({ id: current.id, projectPath: activeProjectPath(), direction }))
      .client
  }

  return {
    activeNoteId: options.noteId,
    activeProjectPath,
    canMoveDown: () => bounds().canMoveDown,
    canMoveUp: () => bounds().canMoveUp,
    groups,
    isError: () => result().type === "error",
    isLoading: () => result().type === "unknown" && notes().length === 0,
    noteMoveDown: () => void noteMove("down"),
    noteMoveUp: () => void noteMove("up"),
    previewHtml: () => markdownHtmlRender(activeNote()?.content ?? ""),
    isPreviewEmpty: () => (activeNote()?.content ?? "").trim() === "",
    retry: () => {
      const currentResult = result()
      if (currentResult.type === "error") currentResult.retry()
    },
  }
}
