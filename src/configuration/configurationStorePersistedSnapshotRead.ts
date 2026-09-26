import { type GitStore, gitStoreRun } from "@adaptive-ds/git-store"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type CodelineConfigurationDocument,
  codelineConfigurationDocumentSchema,
} from "./codelineConfigurationDocumentSchema.js"
import { type ConfigurationRevision, configurationRevisionSchema } from "./configurationRevisionSchema.js"
import { configurationStoreFilePath } from "./configurationStoreFilePath.js"
import type { ConfigurationStoreSnapshot } from "./configurationStoreSnapshot.js"

export async function configurationStorePersistedSnapshotRead(
  gitStore: Readonly<GitStore>,
): Promise<Result<ConfigurationStoreSnapshot>> {
  const op = "configurationStorePersistedSnapshotRead"
  const revision = await gitStoreRun(gitStore, ["rev-parse", "HEAD"])
  if (!revision.success) return createResultError(op, "The configuration revision could not be read.")

  const parsedRevision = v.safeParse(configurationRevisionSchema, revision.data.trim())
  if (!parsedRevision.success) return createResultError(op, "The configuration revision is invalid.")

  const configuration = await gitStoreRun(gitStore, ["show", `${parsedRevision.output}:${configurationStoreFilePath}`])
  if (!configuration.success) return createResultError(op, "The configuration document could not be read.")

  let content: unknown
  try {
    content = JSON.parse(configuration.data)
  } catch {
    return createResultError(op, "The configuration document is invalid.")
  }

  const parsedConfiguration = v.safeParse(codelineConfigurationDocumentSchema, content)
  if (!parsedConfiguration.success) return createResultError(op, "The configuration document is invalid.")

  const snapshot: ConfigurationStoreSnapshot = {
    configuration: parsedConfiguration.output as CodelineConfigurationDocument,
    revision: parsedRevision.output as ConfigurationRevision,
  }
  return createResult(snapshot)
}
