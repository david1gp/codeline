import type { Result } from "@adaptive-ds/result"
import { projectRegistryFolderCreateRequest } from "../project/client/projectRegistryFolderCreateRequest.js"
import { projectRegistryFolderRemoveRequest } from "../project/client/projectRegistryFolderRemoveRequest.js"
import { projectRegistryFolderRenameRequest } from "../project/client/projectRegistryFolderRenameRequest.js"
import { projectRegistryMoveRequest } from "../project/client/projectRegistryMoveRequest.js"
import { projectRegistryRemoveRequest } from "../project/client/projectRegistryRemoveRequest.js"
import { projectRegistryRenameRequest } from "../project/client/projectRegistryRenameRequest.js"
import { sessionSidebarProjectLabelOverridesLoad } from "./sessionSidebarProjectLabelOverridesLoad.js"
import { sessionSidebarProjectLabelOverridesSave } from "./sessionSidebarProjectLabelOverridesSave.js"
import { sessionSidebarProjectLabelResolve } from "./sessionSidebarProjectLabelResolve.js"
import { sessionSidebarSessionDelete } from "./sessionSidebarSessionDelete.js"
import { sessionSidebarSessionRename } from "./sessionSidebarSessionRename.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

export type SessionSidebarFolderTarget = {
  id: string
  label: string
}

export type SessionSidebarProjectTarget = {
  available?: boolean
  folderId?: string | null
  id?: string
  label?: string
  path?: string
  projectId?: string
  projectLabel?: string
  projectPath?: string
}

type SessionSidebarDialog =
  | { kind: "closed" }
  | { kind: "folderCreate" }
  | { kind: "folderRename"; folderId: string; folderLabel: string }
  | { kind: "folderDelete"; folderId: string; folderLabel: string }
  | { kind: "projectMove"; currentFolderId: string | null; projectId: string; projectLabel: string }
  | { kind: "projectRename"; projectId?: string; projectPath: string }
  | { kind: "projectRemove"; projectId?: string; projectPath: string; projectLabel: string }
  | { kind: "projectDelete"; projectPath: string }
  | { kind: "sessionRename"; sessionId: string }
  | { kind: "sessionDelete"; sessionId: string }

type SessionSidebarActionsOptions = {
  availableFolders?: () => readonly { id: string; label: string }[]
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  folderCreate?: (name: string) => Promise<Result<unknown>>
  folderRemove?: (folderId: string) => Promise<Result<unknown>>
  folderRename?: (folderId: string, name: string) => Promise<Result<unknown>>
  onFolderCreated?: (folderId?: string) => void
  onFolderRemoved?: (folderId?: string) => void
  onFolderRenamed?: (folderId?: string) => void
  onProjectMoved?: (projectId?: string) => void
  onProjectRemoved?: (projectId?: string) => void
  onProjectRenamed?: (projectId?: string, displayName?: string) => void
  onSessionDeleted?: (sessionId: string) => void
  projectMove?: (projectId: string, folderId: string | null) => Promise<Result<unknown>>
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

  const folderCreateOpen = () => {
    dialog.set({ kind: "folderCreate" })
    draft.set("")
    errorMessage.set(null)
  }

  const folderCreateSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "folderCreate" || isSaving.get()) return
    const name = draft.get().trim()
    if (name.length === 0) {
      errorMessage.set("Enter a folder name.")
      return
    }
    isSaving.set(true)
    errorMessage.set(null)

    const result =
      options.folderCreate === undefined
        ? await projectRegistryFolderCreateRequest({ name }, { fetch: fetcher })
        : await options.folderCreate(name)
    isSaving.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      return
    }
    options.onFolderCreated?.()
    dialogClose()
  }

  const folderRenameOpen = (target: SessionSidebarFolderTarget) => {
    dialog.set({ kind: "folderRename", folderId: target.id, folderLabel: target.label })
    draft.set(target.label)
    errorMessage.set(null)
  }

  const folderRenameSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "folderRename" || isSaving.get()) return
    const name = draft.get().trim()
    if (name.length === 0) {
      errorMessage.set("Enter a folder name.")
      return
    }
    isSaving.set(true)
    errorMessage.set(null)

    const result =
      options.folderRename === undefined
        ? await projectRegistryFolderRenameRequest(current.folderId, { name }, { fetch: fetcher })
        : await options.folderRename(current.folderId, name)
    isSaving.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      return
    }
    options.onFolderRenamed?.(current.folderId)
    dialogClose()
  }

  const folderDeleteOpen = (target: SessionSidebarFolderTarget) => {
    dialog.set({ kind: "folderDelete", folderId: target.id, folderLabel: target.label })
    errorMessage.set(null)
  }

  const folderDeleteSubmit = async () => {
    const current = dialog.get()
    if (current.kind !== "folderDelete" || isSaving.get()) return
    isSaving.set(true)
    errorMessage.set(null)

    const result =
      options.folderRemove === undefined
        ? await projectRegistryFolderRemoveRequest(current.folderId, { fetch: fetcher })
        : await options.folderRemove(current.folderId)
    isSaving.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      return
    }
    options.onFolderRemoved?.(current.folderId)
    dialogClose()
  }

  const projectMoveOpen = (target: SessionSidebarProjectTarget) => {
    const projectId = target.projectId ?? target.id ?? ""
    const projectLabel = target.projectLabel ?? target.label ?? ""
    const currentFolderId = target.folderId ?? null
    dialog.set({ kind: "projectMove", currentFolderId, projectId, projectLabel })
    draft.set(currentFolderId ?? "")
    errorMessage.set(null)
  }

  const projectMoveSubmit = async (targetFolderId: string | null) => {
    const current = dialog.get()
    if (current.kind !== "projectMove" || isSaving.get()) return
    isSaving.set(true)
    errorMessage.set(null)

    const result =
      options.projectMove === undefined
        ? await projectRegistryMoveRequest(current.projectId, { folderId: targetFolderId }, { fetch: fetcher })
        : await options.projectMove(current.projectId, targetFolderId)
    isSaving.set(false)
    if (!result.success) {
      errorMessage.set(result.errorMessage)
      return
    }
    options.onProjectMoved?.(current.projectId)
    dialogClose()
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
    availableFolders: options.availableFolders,
    dialog: dialog.get,
    dialogClose,
    draft: draft.get,
    draftChange: (value: string) => {
      draft.set(value)
      errorMessage.set(null)
    },
    errorMessage: errorMessage.get,
    folderCreateOpen,
    folderCreateSubmit,
    folderDeleteOpen,
    folderDeleteSubmit,
    folderRenameOpen,
    folderRenameSubmit,
    isSaving: isSaving.get,
    projectDeleteOpen,
    projectDeleteSubmit,
    projectLabel,
    projectMoveOpen,
    projectMoveSubmit,
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
