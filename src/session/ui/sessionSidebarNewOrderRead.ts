import * as v from "valibot"
import { sessionSidebarNewOrderSchema, type SessionSidebarNewOrder } from "./sessionSidebarNewOrderSchema.js"
import { sessionSidebarNewOrderStorageKey } from "./sessionSidebarNewOrderStorageKey.js"

export function sessionSidebarNewOrderRead(
  accountId: string | null,
  storage?: Pick<Storage, "getItem">,
): SessionSidebarNewOrder {
  if (accountId === null) return []
  try {
    const stored = (storage ?? globalThis.localStorage)?.getItem(sessionSidebarNewOrderStorageKey(accountId))
    if (stored === null || stored === undefined) return []
    const parsedJson: unknown = JSON.parse(stored)
    const parsed = v.safeParse(sessionSidebarNewOrderSchema, parsedJson)
    return parsed.success ? parsed.output : []
  } catch (_error: unknown) {
    return []
  }
}
