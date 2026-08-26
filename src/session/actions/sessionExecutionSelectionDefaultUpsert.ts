import { createResultErrorCode } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { projectPathReferenceResolve } from "../../project/projectPathReferenceResolve.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { sessionExecutionSelectionDefaultRepositoryUpsert } from "../db/sessionExecutionSelectionDefaultRepositoryUpsert.js"
import { sessionExecutionSelectionErrorCodes } from "../errors/sessionExecutionSelectionErrorCodes.js"
import { sessionExecutionSelectionSchema } from "../schema/sessionExecutionSelectionSchema.js"
import { sessionExecutionSelectionCanonicalize } from "./sessionExecutionSelectionCanonicalize.js"

export async function sessionExecutionSelectionDefaultUpsert(
  database: DatabaseClient,
  userId: string,
  input: { executionSelection: unknown; projectPath?: string },
  options: { catalog?: ProviderCatalog; projectRootDirs?: readonly string[] } = {},
): ReturnType<typeof sessionExecutionSelectionDefaultRepositoryUpsert> {
  const project = await projectPathReferenceResolve(input.projectPath, options.projectRootDirs ?? [])
  if (!project.success)
    return createResultErrorCode(
      "sessionExecutionSelectionDefaultUpsert",
      "The project path is invalid.",
      sessionExecutionSelectionErrorCodes.projectPathInvalid,
    )

  const parsed = v.safeParse(sessionExecutionSelectionSchema, input.executionSelection)
  if (!parsed.success)
    return createResultErrorCode(
      "sessionExecutionSelectionDefaultUpsert",
      "The execution selection default input is invalid.",
      sessionExecutionSelectionErrorCodes.defaultInputInvalid,
    )
  const canonicalized = sessionExecutionSelectionCanonicalize(parsed.output, parsed.output.tools.primary.agentId, {
    catalog: options.catalog,
  })
  if (!canonicalized.success) return canonicalized
  if (canonicalized.data === null)
    return createResultErrorCode(
      "sessionExecutionSelectionDefaultUpsert",
      "The execution selection default is invalid.",
      sessionExecutionSelectionErrorCodes.selectionInvalid,
    )
  return sessionExecutionSelectionDefaultRepositoryUpsert(database, userId, {
    executionSelection: canonicalized.data,
    projectPath: project.data,
  })
}
