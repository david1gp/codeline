import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useQuery, useZero } from "@rocicorp/zero/solid"
import { useNavigate } from "@solidjs/router"
import { createEffect, onCleanup } from "solid-js"
import * as v from "valibot"
import type { zeroSchema } from "../../database/zeroSchema.js"
import { projectApiDirectoryResponseSchema } from "../../project/api/projectApiDirectoryResponseSchema.js"
import { codelineQueries } from "../../ui/codelineQueries.js"
import { type NoteMutationContext, noteMutators } from "../noteMutators.js"
import { noteLineCount } from "./noteLineCount.js"

type NotePageStateOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  noteId: string
}

export function notePageStateCreate(options: NotePageStateOptions) {
  const navigate = useNavigate()
  const apiBase = options.apiBase ?? "/api/project"
  const fetcher = options.fetcher ?? fetch
  const zero = useZero<typeof zeroSchema, undefined, NoteMutationContext>()
  const [note, noteResult] = useQuery(() => codelineQueries.note({ noteId: options.noteId }))

  const content = createSignalObject<string | null>(null)
  const projectPath = createSignalObject<string | null>(null)
  const projectPaths = createSignalObject<string[]>([])
  const status = createSignalObject<"idle" | "saving" | "error">("idle")
  const isDeleteConfirmOpen = createSignalObject(false)

  createEffect(() => {
    const loaded = note()
    if (loaded === undefined || content.get() !== null) return
    content.set(loaded.content)
    projectPath.set(loaded.projectPath)
  })

  const controller = new AbortController()
  void fetcher(`${apiBase}/directory?path=${encodeURIComponent("")}`, { signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error("The project directory request failed.")
      const parsed = v.safeParse(projectApiDirectoryResponseSchema, await response.json())
      if (!parsed.success || controller.signal.aborted) return
      projectPaths.set(parsed.output.entries.filter((entry) => entry.type === "directory").map((entry) => entry.path))
    })
    .catch((_error: unknown) => {
      if (!controller.signal.aborted) projectPaths.set([])
    })
  onCleanup(() => controller.abort())

  const noteSave = async () => {
    const current = note()
    const editedContent = content.get()
    if (current === undefined || editedContent === null || status.get() === "saving") return

    status.set("saving")
    const mutation = zero().mutate(
      noteMutators.note.update({
        id: current.id,
        content: editedContent,
        projectPath: projectPath.get(),
        updatedAt: Date.now(),
      }),
    )
    const result = await mutation.client
    status.set(result.type === "error" ? "error" : "idle")
  }

  return {
    content: () => content.get() ?? "",
    contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
      content.set(event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    deleteConfirmClose: () => isDeleteConfirmOpen.set(false),
    deleteConfirmOpen: () => isDeleteConfirmOpen.set(true),
    deleteConfirm: async () => {
      const current = note()
      if (current === undefined || status.get() === "saving") return

      status.set("saving")
      const mutation = zero().mutate(noteMutators.note.delete(current.id))
      const result = await mutation.client
      if (result.type === "error") {
        status.set("error")
        isDeleteConfirmOpen.set(false)
        return
      }
      navigate("/notes")
    },
    hasError: () => status.get() === "error",
    isDeleteConfirmOpen: isDeleteConfirmOpen.get,
    isDirty: () => {
      const current = note()
      if (current === undefined || content.get() === null) return false
      return content.get() !== current.content || projectPath.get() !== current.projectPath
    },
    isLoading: () => noteResult().type === "unknown" && note() === undefined,
    isNotFound: () => noteResult().type === "complete" && note() === undefined,
    isSaving: () => status.get() === "saving",
    lineCount: () => noteLineCount(content.get() ?? ""),
    note,
    projectPath: () => projectPath.get() ?? "",
    projectPaths: projectPaths.get,
    projectPathUpdate: (event: Event & { currentTarget: HTMLSelectElement }) => {
      projectPath.set(event.currentTarget.value === "" ? null : event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    submit: async (event: SubmitEvent) => {
      event.preventDefault()
      await noteSave()
    },
  }
}
