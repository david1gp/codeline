import * as v from "valibot"
import { type ProjectFolderDisclosure, projectFolderDisclosureSchema } from "./projectFolderDisclosureSchema.js"
import { projectFolderDisclosureStorageKeyCreate } from "./projectFolderDisclosureStorageKeyCreate.js"

export function projectFolderDisclosureRead(
  accountId: string | null,
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): ProjectFolderDisclosure {
  if (storage === undefined) return {}
  try {
    const key = projectFolderDisclosureStorageKeyCreate(accountId)
    const raw = storage.getItem(key)
    if (raw === null) return {}
    const parsedJson: unknown = JSON.parse(raw)
    const validated = v.safeParse(projectFolderDisclosureSchema, parsedJson)
    return validated.success ? validated.output : {}
  } catch (_error: unknown) {
    return {}
  }
}
