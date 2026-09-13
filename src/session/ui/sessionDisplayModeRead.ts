import * as v from "valibot"
import { type SessionDisplayMode, sessionDisplayModeSchema } from "./sessionDisplayModeSchema.js"
import { sessionDisplayModeStorageKey } from "./sessionDisplayModeStorageKey.js"

export function sessionDisplayModeRead(): SessionDisplayMode {
  try {
    const stored = globalThis.localStorage?.getItem(sessionDisplayModeStorageKey)
    const parsed = v.safeParse(sessionDisplayModeSchema, stored)
    return parsed.success ? parsed.output : "conversation"
  } catch (_error: unknown) {
    return "conversation"
  }
}
