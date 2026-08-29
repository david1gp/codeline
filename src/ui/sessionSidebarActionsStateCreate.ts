import type { Result } from "@adaptive-ds/result"
import { projectRegistryRemoveRequest } from "../project/client/projectRegistryRemoveRequest.js"
import { projectRegistryRenameRequest } from "../project/client/projectRegistryRenameRequest.js"
import { sessionSidebarProjectLabelOverridesLoad } from "./sessionSidebarProjectLabelOverridesLoad.js"
import { sessionSidebarProjectLabelOverridesSave } from "./sessionSidebarProjectLabelOverridesSave.js"
import { sessionSidebarProjectLabelResolve } from "./sessionSidebarProjectLabelResolve.js"
import { sessionSidebarSessionDelete } from "./sessionSidebarSessionDelete.js"
import { sessionSidebarSessionRename } from "./sessionSidebarSessionRename.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

export type SessionSidebarProjectTarget = {
  available?: boolean
  id?: string
  label?: string
  path?: string
  projectId?: string
  projectLabel?: string
  projectPath?: string
}

type SessionSidebarDialog =
  | { kind: "closed" }
  | { kind: "projectRename"; projectId?: string; projectPath: string }
  | { kind: "projectRemove"; projectId?: string; projectPath: string; projectLabel: string }
  | { kind: "projectDelete"; projectPath: string }
  | { kind: "sessionRename"; sessionId: string }
  | { kind: "sessionDelete"; sessionId: string }

type SessionSidebarActionsOptions = {
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onProjectRemoved?: (projectId?: string) => void
  onProjectRenamed?: (projectId?: string, displayName?: string) => void
  onSessionDeleted?: (sessionId: string) => void
  projectRemove?: (projectId: string) => Promise<Result<undefined>>
  projectRename?: (projectId: string, displayName: string) => Promise<Result<unknown>>
  sessionDelete?: (sessionId: string) => Promise<Result<true>>
  sessionRename?: (sessionId: string, title: string) => Promise<Result<string>>
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

  const projectRenameOpen = (target: SessionSidebarProjectTarget | string) => {
    const projectId = typeof target === "object" ? (target.projectId ?? target.id) : undefined
    const projectPath = typeof target === "object" ? (target.projectPath ?? target.path ?? "") : target
    const initialLabel =
      typeof target === "object" && (target.projectLabel || target.label)
        ? (target.projectLabel ?? target.label ?? "")
        : projectLabel(projectPath)
    dialog.set({ kind: "projectRename", projectId, projectPath })
    draft.set(initialLabel)
    errorMessage.set(null)
  }

  const projectRemoveOpen = (target: SessionSidebarProjectTarget | string) => {
    const projectId = typeof target === "object" ? (target.projectId ?? target.id) : undefined
    const projectPath = typeof target === "object" ? (target.projectPath ?? target.path ?? "") : target
    const initialLabel =
      typeof target === "object" && (target.projectLabel || target.label)
        ? (target.projectLabel ?? target.label ?? "")
        : projectLabel(projectPath)
    dialog.set({ kind: "projectRemove", projectId, projectLabel: initialLabel, projectPath })
    errorMessage.set(null)
  }

  const projectDeleteOpen = (target: SessionSidebarProjectTarget | string) => {
    const projectPath = typeof target === "object" ? (target.projectPath ?? target.path ?? "") : target
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

  const projectRenameSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "projectRename" || isSaving.get()) return
    const nextLabel = draft.get().trim()
    if (nextLabel.length === 0) {
      errorMessage.set("Enter a project name.")
      return
    }
    isSaving.set(true)
    errorMessage.set(null)

    if (current.projectId !== undefined) {
      const result =
        options.projectRename === undefined
          ? await projectRegistryRenameRequest(current.projectId, { displayName: nextLabel }, { fetch: fetcher })
          : await options.projectRename(current.projectId, nextLabel)
      isSaving.set(false)
      if (!result.success) {
        errorMessage.set(result.errorMessage)
        return
      }
      if (current.projectPath.length > 0) {
        const next = { ...labels.get(), [current.projectPath]: nextLabel }
        labels.set(next)
        sessionSidebarProjectLabelOverridesSave(next)
      }
      options.onProjectRenamed?.(current.projectId, nextLabel)
      dialogClose()
      return
    }

    const next = { ...labels.get(), [current.projectPath]: nextLabel }
    labels.set(next)
    sessionSidebarProjectLabelOverridesSave(next)
    isSaving.set(false)
    options.onProjectRenamed?.(undefined, nextLabel)
    dialogClose()
  }

  const projectRemoveSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "projectRemove" || isSaving.get()) return
    if (current.projectId === undefined) {
      dialogClose()
      return
    }
    isSaving.set(true)
    errorMessage.set(null)

    const result =
      options.projectRemove === undefined
        ? await projectRegistryRemoveRequest(current.projectId, { fetch: fetcher })
        : await options.projectRemove(current.projectId)
    isSaving.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      return
    }
    if (current.projectPath.length > 0) {
      const next = { ...labels.get() }
      delete next[current.projectPath]
      labels.set(next)
      sessionSidebarProjectLabelOverridesSave(next)
    }
    options.onProjectRemoved?.(current.projectId)
    dialogClose()
  }

  const sessionRenameSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "sessionRename" || isSaving.get()) return
    isSaving.set(true)
    errorMessage.set(null)
    const result =
      options.sessionRename === undefined
        ? await sessionSidebarSessionRename(current.sessionId, draft.get(), fetcher)
        : await options.sessionRename(current.sessionId, draft.get())
    isSaving.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      return
    }
    dialogClose()
  }

  const sessionDeleteImmediate = async (sessionId: string) => {
    const result =
      options.sessionDelete === undefined
        ? await sessionSidebarSessionDelete(sessionId, fetcher)
        : await options.sessionDelete(sessionId)
    if (result.success) options.onSessionDeleted?.(sessionId)
  }

  const sessionDeleteSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "sessionDelete" || isSaving.get()) return
    isSaving.set(true)
    errorMessage.set(null)
    const result =
      options.sessionDelete === undefined
        ? await sessionSidebarSessionDelete(current.sessionId, fetcher)
        : await options.sessionDelete(current.sessionId)
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
      const result =
        options.sessionDelete === undefined
          ? await sessionSidebarSessionDelete(sessionId, fetcher)
          : await options.sessionDelete(sessionId)
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
    projectRemoveOpen,
    projectRemoveSubmit,
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
