import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { type Accessor, createEffect } from "solid-js"
import { projectFolderDisclosureRead } from "./projectFolderDisclosureRead.js"
import { projectFolderDisclosureWrite } from "./projectFolderDisclosureWrite.js"

type ProjectFolderDisclosureStateOptions = {
  accountId?: Accessor<string | null>
  storage?: Pick<Storage, "getItem" | "setItem">
}

export function projectFolderDisclosureStateCreate(options: ProjectFolderDisclosureStateOptions = {}) {
  const storage = options.storage ?? globalThis.localStorage
  const accountId = () => options.accountId?.() ?? null
  const preferences = createSignalObject<Record<string, boolean>>(projectFolderDisclosureRead(accountId(), storage))

  createEffect(() => {
    const id = accountId()
    preferences.set(projectFolderDisclosureRead(id, storage))
  })

  const isFolderOpen = (folderId: string, isDescendantSelected = false): boolean => {
    if (isDescendantSelected) return true
    const preference = preferences.get()[folderId]
    return preference ?? true
  }

  const folderToggle = (folderId: string, open: boolean): void => {
    preferences.set({ ...preferences.get(), [folderId]: open })
    projectFolderDisclosureWrite(accountId(), folderId, open, storage)
  }

  return {
    folderToggle,
    isFolderOpen,
    preferences: preferences.get,
  }
}
