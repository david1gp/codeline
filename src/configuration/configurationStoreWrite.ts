import { type GitStore, gitStoreRun, gitStoreWrite } from "@adaptive-ds/git-store"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type CodelineConfigurationDocument,
  codelineConfigurationDocumentSchema,
} from "./codelineConfigurationDocumentSchema.js"
import { type ConfigurationRevision, configurationRevisionSchema } from "./configurationRevisionSchema.js"
import type { ConfigurationStore } from "./configurationStore.js"
import { configurationStoreFilePath } from "./configurationStoreFilePath.js"
import type { ConfigurationStoreSnapshot } from "./configurationStoreSnapshot.js"
import { configurationStoreSnapshotFreeze } from "./configurationStoreSnapshotFreeze.js"

const configurationStoreCommitMessage = "chore(configuration): update configuration"

export async function configurationStoreWrite(
  store: ConfigurationStore,
  input: unknown,
): Promise<Result<ConfigurationRevision>> {
  const op = "configurationStoreWrite"
  const parsed = v.safeParse(codelineConfigurationDocumentSchema, input)
  if (!parsed.success) return createResultError(op, "The configuration document is invalid.")

  const nonPushingGitStore = Object.freeze({ ...store.gitStore, autoPush: false })
  const written = await gitStoreWrite(
    nonPushingGitStore,
    configurationStoreFilePath,
    parsed.output,
    configurationStoreCommitMessage,
  )
  if (!written.success) {
    await configurationStoreWriteRollback(store.gitStore)
    return createResultError(op, "The configuration document could not be committed.")
  }

  const currentRevision = await gitStoreRun(store.gitStore, ["rev-parse", "HEAD"])
  if (!currentRevision.success) {
    await configurationStoreWriteRollback(store.gitStore)
    return createResultError(op, "The configuration revision could not be read.")
  }

  const parsedRevision = v.safeParse(configurationRevisionSchema, currentRevision.data.trim())
  if (!parsedRevision.success) return createResultError(op, "The configuration revision is invalid.")

  const snapshot: ConfigurationStoreSnapshot = {
    configuration: parsed.output as CodelineConfigurationDocument,
    revision: parsedRevision.output as ConfigurationRevision,
  }
  store.snapshot = configurationStoreSnapshotFreeze(snapshot)
  return createResult(snapshot.revision)
}

async function configurationStoreWriteRollback(gitStore: Readonly<GitStore>): Promise<void> {
  const head = await gitStoreRun(gitStore, ["rev-parse", "--verify", "HEAD"])
  if (head.success) {
    const restored = await gitStoreRun(gitStore, [
      "restore",
      "--source=HEAD",
      "--staged",
      "--worktree",
      "--",
      configurationStoreFilePath,
    ])
    if (restored.success) return
  }

  const reset = await gitStoreRun(gitStore, ["reset", "HEAD", "--", configurationStoreFilePath])
  if (!reset.success) {
    const removedFromIndex = await gitStoreRun(gitStore, [
      "rm",
      "--cached",
      "--ignore-unmatch",
      "--",
      configurationStoreFilePath,
    ])
    if (!removedFromIndex.success) return
  }

  await gitStoreRun(gitStore, ["clean", "-f", "--", configurationStoreFilePath])
}
