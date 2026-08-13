import { createSignal } from "solid-js/dist/solid.js"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../../api/errors/apiErrorResponseSchema.js"
import { sessionRenameRequestSchema } from "../schema/sessionRenameRequestSchema.js"

type SessionRenameControlStateOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onRenamed?: (title: string) => void
  sessionId: () => string
  title: () => string
}

export function sessionRenameControlStateCreate(options: SessionRenameControlStateOptions) {
  const fetcher = options.fetcher ?? fetch
  const [renamedTitle, renamedTitleSet] = createSignal<string>()
  const [draft, draftSet] = createSignal(options.title())
  const [errorMessage, errorMessageSet] = createSignal<string>()
  const [isEditing, isEditingSet] = createSignal(false)
  const [isSaving, isSavingSet] = createSignal(false)
  let editButton: HTMLButtonElement | undefined
  let input: HTMLInputElement | undefined
  const displayedTitle = () => renamedTitle() ?? options.title()

  const editFocus = () => queueMicrotask(() => editButton?.focus())

  const editCancel = () => {
    if (isSaving()) return
    draftSet(displayedTitle())
    errorMessageSet(undefined)
    isEditingSet(false)
    editFocus()
  }

  const renameSave = async () => {
    if (isSaving()) return
    const parsed = v.safeParse(sessionRenameRequestSchema, { title: draft() })
    if (!parsed.success) {
      errorMessageSet(
        draft().trim().length === 0 ? "Enter a session title." : "Session titles can be at most 500 characters.",
      )
      return
    }

    isSavingSet(true)
    errorMessageSet(undefined)
    try {
      const response = await fetcher(`/api/sessions/${encodeURIComponent(options.sessionId())}`, {
        body: JSON.stringify(parsed.output),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      })
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => undefined)
        const error = v.safeParse(apiErrorResponseSchema, body)
        errorMessageSet(error.success ? error.output.error.message : "The session could not be renamed.")
        return
      }

      renamedTitleSet(parsed.output.title)
      draftSet(parsed.output.title)
      isEditingSet(false)
      options.onRenamed?.(parsed.output.title)
      editFocus()
    } catch (_error: unknown) {
      errorMessageSet("The session could not be renamed. Check your connection and try again.")
    } finally {
      isSavingSet(false)
    }
  }

  return {
    beginEdit: () => {
      draftSet(displayedTitle())
      errorMessageSet(undefined)
      isEditingSet(true)
      queueMicrotask(() => {
        input?.focus()
        input?.select()
      })
    },
    cancel: editCancel,
    canSave: () => draft().trim().length > 0 && draft().trim().length <= 500 && !isSaving(),
    displayedTitle,
    draft,
    editButtonBind: (element: HTMLButtonElement) => {
      editButton = element
    },
    errorMessage,
    inputBind: (element: HTMLInputElement) => {
      input = element
    },
    inputKeyDown: (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return
      event.preventDefault()
      editCancel()
    },
    inputUpdate: (event: InputEvent & { currentTarget: HTMLInputElement }) => {
      draftSet(event.currentTarget.value)
      errorMessageSet(undefined)
    },
    isEditing,
    isSaving,
    submit: (event: SubmitEvent) => {
      event.preventDefault()
      void renameSave()
    },
  }
}
