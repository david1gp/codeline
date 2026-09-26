import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ConfigurationStore } from "./configurationStore.js"
import { configurationStorePersistedSnapshotRead } from "./configurationStorePersistedSnapshotRead.js"
import type { ConfigurationStoreSnapshot } from "./configurationStoreSnapshot.js"
import { configurationStoreSnapshotFreeze } from "./configurationStoreSnapshotFreeze.js"

export async function configurationStoreReload(store: ConfigurationStore): Promise<Result<ConfigurationStoreSnapshot>> {
  const op = "configurationStoreReload"
  const snapshot = await configurationStorePersistedSnapshotRead(store.gitStore)
  if (!snapshot.success) return createResultError(op, snapshot.errorMessage)
  store.snapshot = configurationStoreSnapshotFreeze(snapshot.data)
  return createResult(structuredClone(store.snapshot))
}
