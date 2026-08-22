import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { makeFunctionReference } from "convex/server"
import { useNavigate } from "@solidjs/router"
import * as v from "valibot"
import type { Result } from "@adaptive-ds/result"
import { codelineConvexMutationCreate } from "../../convex/codelineConvexMutationCreate.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import type { NewNoteScreenView } from "./newNoteScreenView.js"
import { noteContentFieldStateCreate } from "./noteContentFieldStateCreate.js"
import { noteTitleStateCreate } from "./noteTitleStateCreate.js"
import { noteViewModeStateCreate } from "./noteViewModeStateCreate.js"
import type { NoteRecord } from "../convex/noteRecord.js"

const draftKey = "codeline.note.new.content"
const noteCreateReference = makeFunctionReference<"mutation", Record<string, unknown>, Result<NoteRecord>>(
  "notes:noteCreate",
)

export function newNotePageStateCreate(): NewNoteScreenView {
  const navigate = useNavigate()
  const noteCreate = codelineConvexMutationCreate<NoteRecord>(noteCreateReference)
  const storedDraft = v.safeParse(v.string(), localStorage.getItem(draftKey))
  const content = createSignalObject(storedDraft.success ? storedDraft.output : "")
  const status = createSignalObject<"idle" | "saving" | "error">("idle")
  const viewModeState = noteViewModeStateCreate()
  const contentField = noteContentFieldStateCreate({ content: content.get, viewMode: viewModeState.viewMode })
  const titleState = noteTitleStateCreate({ content: content.get })

  return {
    ...viewModeState,
    contentField,
    title: titleState.title,
    content: content.get,
    isSaving: () => status.get() === "saving",
    hasError: () => status.get() === "error",
    contentUpdate: (event) => {
      content.set(event.currentTarget.value)
      localStorage.setItem(draftKey, event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    submit: async (event) => {
      event.preventDefault()
      if (content.get().trim() === "" || status.get() === "saving") return
      status.set("saving")
      const now = Date.now()
      const result = await noteCreate({
        content: content.get(),
        createdAt: now,
        id: uuidv7(),
        projectPath: null,
        updatedAt: now,
      })
      if (!result.success) {
        status.set("error")
        return
      }
      localStorage.removeItem(draftKey)
      navigate("/notes")
    },
  }
}
