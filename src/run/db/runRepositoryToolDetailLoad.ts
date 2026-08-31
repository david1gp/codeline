import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import * as v from "valibot"
import type { RunToolDetailResponse } from "../api/runToolDetailResponseSchema.js"
import { runToolDetailResponseSchema } from "../api/runToolDetailResponseSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runRepositoryTranscriptLoad } from "./runRepositoryTranscriptLoad.js"
import { runTranscriptProject } from "../actions/runTranscriptProject.js"
import { runTranscriptToolDetailsProject } from "../actions/runTranscriptToolDetailsProject.js"

export async function runRepositoryToolDetailLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
  detailId: string,
): Promise<Result<RunToolDetailResponse>> {
  const loaded = await runRepositoryTranscriptLoad(database, userId, organizationId, sessionId, runId)
  if (!loaded.success) return loaded
  const projected = runTranscriptProject({
    attempts: loaded.data.attempts,
    events: loaded.data.events,
    includeToolCallIds: true,
    run: loaded.data.run,
  })
  if (!projected.success)
    return createResultErrorCode("runRepositoryToolDetailLoad", projected.errorMessage, runErrorCodes.toolDetailInvalid)
  const tool = runTranscriptToolDetailsProject(loaded.data.run.id, projected.data).find(
    (candidate) => candidate.detailId === detailId || candidate.toolCallId === detailId,
  )
  if (tool === undefined)
    return createResultErrorCode(
      "runRepositoryToolDetailLoad",
      "The tool detail could not be found.",
      runErrorCodes.toolNotFound,
    )
  const response = v.safeParse(runToolDetailResponseSchema, {
    runId: loaded.data.run.id,
    sessionId: loaded.data.run.sessionId,
    tool,
  })
  if (!response.success)
    return createResultErrorCode(
      "runRepositoryToolDetailLoad",
      "The tool detail response is invalid.",
      runErrorCodes.toolDetailInvalid,
    )
  return createResult(response.output)
}
