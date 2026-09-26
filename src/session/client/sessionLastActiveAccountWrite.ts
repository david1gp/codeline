import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import { sessionLastActiveAccountStorageKey } from "./sessionLastActiveAccountStorageKey.js"

/**
 * Records the signed-in application user so a later signed-out or offline visit
 * can browse that account's cached settled sessions read-only. Sign-out never
 * clears it, matching the "do not delete cached account data on sign-out" rule.
 */
export function sessionLastActiveAccountWrite(
  userId: string,
  storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
  if (storage === undefined) return
  const parsed = v.safeParse(apiPublicIdSchema, userId)
  if (!parsed.success) return
  const write = () => storage.setItem(sessionLastActiveAccountStorageKey, parsed.output)
  if (typeof requestIdleCallback === "function") requestIdleCallback(() => write())
  else queueMicrotask(write)
}
