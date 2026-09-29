import * as v from "valibot"
import { sessionSidebarNewModeSchema, type SessionSidebarNewMode } from "./sessionSidebarNewModeSchema.js"
import { sessionSidebarNewModeStorageKey } from "./sessionSidebarNewModeStorageKey.js"

export function sessionSidebarNewModeRead(storage?: Pick<Storage, "getItem">): SessionSidebarNewMode {
  try {
    const parsed = v.safeParse(
      sessionSidebarNewModeSchema,
      (storage ?? globalThis.localStorage)?.getItem(sessionSidebarNewModeStorageKey),
    )
    return parsed.success ? parsed.output : "flat"
  } catch (_error: unknown) {
    return "flat"
  }
}
