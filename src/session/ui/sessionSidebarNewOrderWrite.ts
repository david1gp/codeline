import * as v from "valibot"
import { sessionSidebarNewOrderSchema } from "./sessionSidebarNewOrderSchema.js"
import { sessionSidebarNewOrderStorageKey } from "./sessionSidebarNewOrderStorageKey.js"

export function sessionSidebarNewOrderWrite(
  accountId: string | null,
  order: readonly string[],
  storage?: Pick<Storage, "setItem">,
): void {
  if (accountId === null) return
  const parsed = v.safeParse(sessionSidebarNewOrderSchema, order)
  if (!parsed.success) return
  try {
    const resolvedStorage = storage ?? globalThis.localStorage
    resolvedStorage?.setItem(sessionSidebarNewOrderStorageKey(accountId), JSON.stringify(parsed.output))
  } catch (_error: unknown) {
    // Keep the in-memory ordering when browser storage is unavailable.
  }
}
