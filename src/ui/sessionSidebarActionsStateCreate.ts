import { sessionSidebarProjectLabelOverridesLoad } from "./sessionSidebarProjectLabelOverridesLoad.js"
import { sessionSidebarProjectLabelOverridesSave } from "./sessionSidebarProjectLabelOverridesSave.js"
import { sessionSidebarProjectLabelResolve } from "./sessionSidebarProjectLabelResolve.js"
import { sessionSidebarSessionDelete } from "./sessionSidebarSessionDelete.js"
import { sessionSidebarSessionRename } from "./sessionSidebarSessionRename.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionSidebarDialog =
  | { kind: "closed" }
  | { kind: "projectRename"; projectPath: string }
  | { kind: "projectDelete"; projectPath: string }
  | { kind: "sessionRename"; sessionId: string }
  | { kind: "sessionDelete"; sessionId: string }

type SessionSidebarActionsOptions = {
  fetcher?: typeof fetch
  onSessionDeleted?: (sessionId: string) => void
  sessionTitle: (sessionId: string) => string | undefined
  sessionIdsForProject: (projectPath: string) => readonly string[]
  sessionTitlesForProject: (projectPath: string) => readonly string[]
}

export function sessionSidebarActionsStateCreate(options: SessionSidebarActionsOptions) {
  const fetcher = options.fetcher ?? fetch
  const labels = signalObjectCreate(sessionSidebarProjectLabelOverridesLoad())
  const dialog = signalObjectCreate<SessionSidebarDialog>({ kind: "closed" })
  const draft = signalObjectCreate("")
  const errorMessage = signalObjectCreate<string | null>(null)
  const isSaving = signalObjectCreate(false)

  const projectLabel = (projectPath: string) =>
    labels.get()[projectPath] ?? sessionSidebarProjectLabelResolve(projectPath)

  const dialogClose = () => {
    if (isSaving.get()) return
    dialog.set({ kind: "closed" })
    draft.set("")
    errorMessage.set(null)
  }

  const projectRenameOpen = (projectPath: string) => {
    dialog.set({ kind: "projectRename", projectPath })
    draft.set(projectLabel(projectPath))
    errorMessage.set(null)
  }

  const projectDeleteOpen = (projectPath: string) => {
    dialog.set({ kind: "projectDelete", projectPath })
    errorMessage.set(null)
  }

  const sessionRenameOpen = (sessionId: string) => {
    dialog.set({ kind: "sessionRename", sessionId })
    draft.set(options.sessionTitle(sessionId) ?? "")
    errorMessage.set(null)
  }

  const sessionDeleteOpen = (sessionId: string) => {
    dialog.set({ kind: "sessionDelete", sessionId })
    errorMessage.set(null)
  }

  const projectRenameSubmit = () => {
    const current = dialog.get()
    if (current.kind !== "projectRename") return
    const nextLabel = draft.get().trim()
    if (nextLabel.length === 0) {
      errorMessage.set("Enter a project name.")
      return
    }
    const next = { ...labels.get(), [current.projectPath]: nextLabel }
    labels.set(next)
    sessionSidebarProjectLabelOverridesSave(next)
    dialogClose()
  }

  const sessionRenameSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "sessionRename" || isSaving.get()) return
    isSaving.set(true)
    errorMessage.set(null)
    const result = await sessionSidebarSessionRename(current.sessionId, draft.get(), fetcher)
    isSaving.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      return
    }
    dialogClose()
  }

  const sessionDeleteImmediate = async (sessionId: string) => {
    const result = await sessionSidebarSessionDelete(sessionId, fetcher)
    if (result.success) options.onSessionDeleted?.(sessionId)
  }

  const sessionDeleteSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "sessionDelete" || isSaving.get()) return
    isSaving.set(true)
    errorMessage.set(null)
    const result = await sessionSidebarSessionDelete(current.sessionId, fetcher)
    isSaving.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      return
    }
    options.onSessionDeleted?.(current.sessionId)
    dialogClose()
  }

  const projectDeleteSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "projectDelete" || isSaving.get()) return
    isSaving.set(true)
    errorMessage.set(null)
    const deletedIds = options.sessionIdsForProject(current.projectPath)
    for (const sessionId of deletedIds) {
      const result = await sessionSidebarSessionDelete(sessionId, fetcher)
      if (!result.success) {
        isSaving.set(false)
        errorMessage.set(result.errorMessage)
        return
      }
    }
    for (const sessionId of deletedIds) options.onSessionDeleted?.(sessionId)
    const next = { ...labels.get() }
    delete next[current.projectPath]
    labels.set(next)
    sessionSidebarProjectLabelOverridesSave(next)
    isSaving.set(false)
    dialogClose()
  }

  return {
    dialog: dialog.get,
    dialogClose,
    draft: draft.get,
    draftChange: (value: string) => {
      draft.set(value)
      errorMessage.set(null)
    },
    errorMessage: errorMessage.get,
    isSaving: isSaving.get,
    projectDeleteOpen,
    projectDeleteSubmit,
    projectLabel,
    projectRenameOpen,
    projectRenameSubmit,
    sessionDeleteImmediate,
    sessionDeleteOpen,
    sessionDeleteSubmit,
    sessionRenameOpen,
    sessionRenameSubmit,
    sessionTitle: options.sessionTitle,
    sessionTitlesForProject: options.sessionTitlesForProject,
  }
}

export type SessionSidebarActionsState = ReturnType<typeof sessionSidebarActionsStateCreate>
