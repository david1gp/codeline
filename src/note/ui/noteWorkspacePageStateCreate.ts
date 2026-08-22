import { makeFunctionReference } from "convex/server"
import type { Result } from "@adaptive-ds/result"
import { codelineConvexMutationCreate } from "../../convex/codelineConvexMutationCreate.js"
import { codelineConvexQueryCreate } from "../../convex/codelineConvexQueryCreate.js"
import { markdownHtmlRender } from "../../markdown/markdownHtmlRender.js"
import { noteGroupsDerive } from "./noteGroupsDerive.js"
import { noteMoveBoundsResolve } from "./noteMoveBoundsResolve.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NoteWorkspaceSidebarView } from "./noteWorkspaceScreenView.js"
import type { NoteRecord } from "../convex/noteRecord.js"

type NoteWorkspacePageStateOptions = {
  noteId: () => string
}

export function noteWorkspacePageStateCreate(options: NoteWorkspacePageStateOptions): NoteWorkspaceSidebarView {
  const noteListReference = makeFunctionReference<"query", Record<string, unknown>, Result<NoteRecord[]>>(
    "notes:noteList",
  )
  const noteReorderReference = makeFunctionReference<
    "mutation",
    Record<string, unknown>,
    Result<NoteRecord | undefined>
  >("notes:noteReorder")
  const notesQuery = codelineConvexQueryCreate<NoteRecord[]>(noteListReference, () => ({}), { keepData: true })
  const noteReorder = codelineConvexMutationCreate<NoteRecord | undefined>(noteReorderReference)
  const projectList = noteProjectListStateCreate()
  const notes = () => notesQuery.data() ?? []
  const groups = () => noteGroupsDerive(notes(), projectList.projects())
  const activeNote = () => notes().find((note) => note.id === options.noteId())
  const activeProjectPath = () => activeNote()?.projectPath ?? null
  const projectNotes = () => groups().find((group) => group.projectPath === activeProjectPath())?.notes ?? []
  const bounds = () => noteMoveBoundsResolve(projectNotes(), options.noteId())
  const noteMove = async (direction: "up" | "down") => {
    const current = activeNote()
    if (current === undefined) return
    if (direction === "up" ? !bounds().canMoveUp : !bounds().canMoveDown) return
    await noteReorder({ direction, id: current.id, projectPath: activeProjectPath() })
  }

  return {
    activeNoteId: options.noteId,
    activeProjectPath,
    canMoveDown: () => bounds().canMoveDown,
    canMoveUp: () => bounds().canMoveUp,
    groups,
    isError: notesQuery.isError,
    isLoading: () => notesQuery.isLoading() && notes().length === 0,
    noteMoveDown: () => void noteMove("down"),
    noteMoveUp: () => void noteMove("up"),
    previewHtml: () => markdownHtmlRender(activeNote()?.content ?? ""),
    isPreviewEmpty: () => (activeNote()?.content ?? "").trim() === "",
    retry: notesQuery.retry,
  }
}
