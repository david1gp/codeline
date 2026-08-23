import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { sessionLastActiveAccountStorageKey } from "./sessionLastActiveAccountStorageKey.js"

/**
 * Reads the last application user that was signed in on this device. Signed-out
 * and offline browsing is permitted only for that account, so one account's
 * cached records can never be rendered as another account's data.
 */
export function sessionLastActiveAccountRead(
  storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): string | null {
  if (storage === undefined) return null
  const stored = storage.getItem(sessionLastActiveAccountStorageKey)
  const parsed = v.safeParse(apiPublicIdSchema, stored)
  if (!parsed.success) return null
  return parsed.output
}
