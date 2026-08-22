import { makeFunctionReference } from "convex/server"
import type { Result } from "@adaptive-ds/result"
import { codelineConvexQueryCreate } from "../../convex/codelineConvexQueryCreate.js"
import type { NoteRecord } from "../convex/noteRecord.js"
import { noteGroupsDerive } from "./noteGroupsDerive.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NotesScreenView } from "./notesScreenView.js"

export function notesPageStateCreate(): NotesScreenView {
  const noteListReference = makeFunctionReference<"query", Record<string, unknown>, Result<NoteRecord[]>>(
    "notes:noteList",
  )
  const notesQuery = codelineConvexQueryCreate<NoteRecord[]>(noteListReference, () => ({}), { keepData: true })
  const projectList = noteProjectListStateCreate()

  return {
    groups: () => noteGroupsDerive(notesQuery.data() ?? [], projectList.projects()),
    isEmpty: () => notesQuery.isComplete() && (notesQuery.data()?.length ?? 0) === 0,
    isLoading: () => notesQuery.isLoading() && notesQuery.data() === undefined,
    isError: notesQuery.isError,
    retry: notesQuery.retry,
  }
}
