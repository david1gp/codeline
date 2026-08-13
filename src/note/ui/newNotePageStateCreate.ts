import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { useZero } from "@rocicorp/zero/solid"
import { useNavigate } from "@solidjs/router"
import * as v from "valibot"
import { zeroSchema } from "../../database/zeroSchema.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { type NoteMutationContext, noteMutators } from "../noteMutators.js"
import { noteTitleStateCreate } from "./noteTitleStateCreate.js"
import { noteViewModeStateCreate } from "./noteViewModeStateCreate.js"

const draftKey = "codeline.note.new.content"

export function newNotePageStateCreate() {
  const navigate = useNavigate()
  const zero = useZero<typeof zeroSchema, undefined, NoteMutationContext>()
  const storedDraft = v.safeParse(v.string(), localStorage.getItem(draftKey))
  const content = createSignalObject(storedDraft.success ? storedDraft.output : "")
  const status = createSignalObject<"idle" | "saving" | "error">("idle")
  const viewModeState = noteViewModeStateCreate()
  const titleState = noteTitleStateCreate({ content: content.get })

  return {
    ...viewModeState,
    title: titleState.title,
    content: content.get,
    isSaving: () => status.get() === "saving",
    hasError: () => status.get() === "error",
    contentUpdate: (event: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
      content.set(event.currentTarget.value)
      localStorage.setItem(draftKey, event.currentTarget.value)
      if (status.get() === "error") status.set("idle")
    },
    submit: async (event: SubmitEvent) => {
      event.preventDefault()
      if (content.get().trim() === "" || status.get() === "saving") return

      status.set("saving")
      const now = Date.now()
      const mutation = zero().mutate(
        noteMutators.note.create({
          id: uuidv7(),
          content: content.get(),
          projectPath: null,
          createdAt: now,
          updatedAt: now,
        }),
      )
      const result = await mutation.client
      if (result.type === "error") {
        status.set("error")
        return
      }

      localStorage.removeItem(draftKey)
      navigate("/notes")
    },
  }
}
