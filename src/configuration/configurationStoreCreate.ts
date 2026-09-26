import { gitStoreOpen, gitStoreRun } from "@adaptive-ds/git-store"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { ConfigurationStore } from "./configurationStore.js"
import { configurationStorePersistedSnapshotRead } from "./configurationStorePersistedSnapshotRead.js"
import { configurationStoreSnapshotFreeze } from "./configurationStoreSnapshotFreeze.js"

export type ConfigurationStoreCreateOptions = {
  authorEmail: string
  authorName: string
  branch: string
  dir: string
}

export async function configurationStoreCreate(
  options: ConfigurationStoreCreateOptions,
): Promise<Result<ConfigurationStore>> {
  const op = "configurationStoreCreate"
  const opened = await gitStoreOpen({
    autoPush: false,
    authorEmail: options.authorEmail,
    authorName: options.authorName,
    branch: options.branch,
    dir: options.dir,
  })
  if (!opened.success) return createResultError(op, "The configuration repository could not be opened.")

  const store: ConfigurationStore = { gitStore: Object.freeze(opened.data), snapshot: undefined }
  const head = await gitStoreRun(store.gitStore, ["rev-parse", "--verify", "HEAD"])
  if (!head.success) return createResult(store)

  const snapshot = await configurationStorePersistedSnapshotRead(store.gitStore)
  if (!snapshot.success) return createResultError(op, snapshot.errorMessage)
  store.snapshot = configurationStoreSnapshotFreeze(snapshot.data)
  return createResult(store)
}
