import { type GitStore, gitStoreRun, gitStoreWrite } from "@adaptive-ds/git-store"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { globalAgentPresetDocumentDefaults } from "./globalAgentPresetDocumentDefaults.js"
import { type GlobalAgentPresetDocument, globalAgentPresetDocumentSchema } from "./globalAgentPresetDocumentSchema.js"

export const globalAgentPresetDocumentFilePath = "global-agent-presets.json"

export async function globalAgentPresetDocumentRead(
  gitStore: Readonly<GitStore>,
): Promise<Result<GlobalAgentPresetDocument>> {
  const op = "globalAgentPresetDocumentRead"
  const revision = await gitStoreRun(gitStore, ["rev-parse", "HEAD"])
  if (!revision.success) {
    const noCommittedRevision =
      revision.errorMessage.includes("unknown revision or path not in the working tree") ||
      revision.errorMessage.includes("Needed a single revision")
    return noCommittedRevision
      ? createResult(globalAgentPresetDocumentDefaults())
      : createResultError(op, "The global agent preset revision could not be read.")
  }
  const revisionId = revision.data.trim()
  if (!/^[0-9a-f]{40}$/.test(revisionId)) {
    return createResultError(op, "The global agent preset revision is invalid.")
  }
  const content = await gitStoreRun(gitStore, ["show", `${revisionId}:${globalAgentPresetDocumentFilePath}`])
  if (!content.success) {
    const missingDocument = content.errorMessage.includes(
      `path '${globalAgentPresetDocumentFilePath}' does not exist in`,
    )
    return missingDocument
      ? createResult(globalAgentPresetDocumentDefaults())
      : createResultError(op, "The global agent preset document could not be read.")
  }
  let input: unknown
  try {
    input = JSON.parse(content.data)
  } catch {
    return createResultError(op, "The global agent preset document is invalid.")
  }
  const parsed = v.safeParse(globalAgentPresetDocumentSchema, input)
  if (!parsed.success) return createResultError(op, "The global agent preset document is invalid.")
  return createResult(parsed.output as GlobalAgentPresetDocument)
}

export async function globalAgentPresetDocumentWrite(
  gitStore: Readonly<GitStore>,
  input: unknown,
): Promise<Result<string>> {
  const op = "globalAgentPresetDocumentWrite"
  const parsed = v.safeParse(globalAgentPresetDocumentSchema, input)
  if (!parsed.success) return createResultError(op, "The global agent preset document is invalid.")
  const written = await gitStoreWrite(
    Object.freeze({ ...gitStore, autoPush: false }),
    globalAgentPresetDocumentFilePath,
    parsed.output,
    "chore(configuration): update global agent presets",
  )
  if (!written.success) return createResultError(op, "The global agent preset document could not be committed.")
  const revision = await gitStoreRun(gitStore, ["rev-parse", "HEAD"])
  if (!revision.success || !/^[0-9a-f]{40}\s*$/.test(revision.data)) {
    return createResultError(op, "The global agent preset revision could not be read.")
  }
  return createResult(revision.data.trim())
}
