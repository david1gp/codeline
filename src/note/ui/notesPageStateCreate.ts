import { useQuery } from "@rocicorp/zero/solid"
import { codelineQueries } from "../../ui/codelineQueries.js"
import { noteGroupsDerive } from "./noteGroupsDerive.js"
import { noteProjectListStateCreate } from "./noteProjectListStateCreate.js"
import type { NotesScreenView } from "./notesScreenView.js"

export function notesPageStateCreate(): NotesScreenView {
  const [notes, result] = useQuery(() => codelineQueries.notes())
  const projectList = noteProjectListStateCreate()

  return {
    groups: () => noteGroupsDerive(notes(), projectList.projects()),
    isEmpty: () => result().type === "complete" && notes().length === 0,
    isLoading: () => result().type === "unknown" && notes().length === 0,
    isError: () => result().type === "error",
    retry: () => {
      const currentResult = result()
      if (currentResult.type === "error") currentResult.retry()
    },
  }
}
