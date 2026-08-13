import { useQuery } from "@rocicorp/zero/solid"
import { codelineQueries } from "../../ui/codelineQueries.js"

export function notesPageStateCreate() {
  const [notes, result] = useQuery(() => codelineQueries.notes())

  return {
    groups: () => {
      const groups = new Map<string | null, ReturnType<typeof notes>>()
      for (const note of notes()) {
        const group = groups.get(note.projectPath) ?? []
        group.push(note)
        groups.set(note.projectPath, group)
      }
      return [...groups].map(([projectPath, groupedNotes]) => ({ projectPath, notes: groupedNotes }))
    },
    isEmpty: () => result().type === "complete" && notes().length === 0,
    isLoading: () => result().type === "unknown" && notes().length === 0,
    isError: () => result().type === "error",
    retry: () => {
      const currentResult = result()
      if (currentResult.type === "error") currentResult.retry()
    },
  }
}
