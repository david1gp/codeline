import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ConfigurationStore } from "./configurationStore.js"
import type { ConfigurationStoreSnapshot } from "./configurationStoreSnapshot.js"

export function configurationStoreRead(store: ConfigurationStore): Result<ConfigurationStoreSnapshot> {
  const op = "configurationStoreRead"
  if (store.snapshot === undefined) return createResultError(op, "The configuration has not been loaded.")
  return createResult(structuredClone(store.snapshot))
}
