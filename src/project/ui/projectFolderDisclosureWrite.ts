import { projectFolderDisclosureRead } from "./projectFolderDisclosureRead.js"
import { projectFolderDisclosureStorageKeyCreate } from "./projectFolderDisclosureStorageKeyCreate.js"

export function projectFolderDisclosureWrite(
  accountId: string | null,
  folderId: string,
  open: boolean,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage,
): void {
  if (storage === undefined) return
  const current = projectFolderDisclosureRead(accountId, storage)
  const updated = { ...current, [folderId]: open }
  const key = projectFolderDisclosureStorageKeyCreate(accountId)
  const serialized = JSON.stringify(updated)
  const write = () => {
    try {
      storage.setItem(key, serialized)
    } catch (_error: unknown) {
      // Storage quota or restriction; ignore write failure.
    }
  }
  if (typeof requestIdleCallback === "function") requestIdleCallback(() => write())
  else queueMicrotask(write)
}
