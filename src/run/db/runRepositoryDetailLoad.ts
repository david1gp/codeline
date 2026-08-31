import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import * as v from "valibot"
import { runDetailResponseSchema, type RunDetailResponse } from "../api/runDetailResponseSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runTranscriptBoundedCreate } from "../actions/runTranscriptBoundedCreate.js"
import { runTranscriptProject } from "../actions/runTranscriptProject.js"
import { runTranscriptToolDetailsProject } from "../actions/runTranscriptToolDetailsProject.js"
import { runRepositoryTranscriptLoad } from "./runRepositoryTranscriptLoad.js"

export async function runRepositoryDetailLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
): Promise<Result<RunDetailResponse>> {
  const loaded = await runRepositoryTranscriptLoad(database, userId, organizationId, sessionId, runId)
  if (!loaded.success) return loaded
  const projected = runTranscriptProject({
    attempts: loaded.data.attempts,
    events: loaded.data.events,
    includeToolCallIds: true,
    run: loaded.data.run,
  })
  if (!projected.success)
    return createResultErrorCode("runRepositoryDetailLoad", projected.errorMessage, runErrorCodes.detailInvalid)
  const transcript = runTranscriptBoundedCreate(projected.data)
  if (!transcript.success)
    return createResultErrorCode("runRepositoryDetailLoad", transcript.errorMessage, runErrorCodes.detailInvalid)
  const response = {
    run: {
      cancellationKind: loaded.data.run.cancellationKind,
      failure: loaded.data.run.failure,
      id: loaded.data.run.id,
      sessionId: loaded.data.run.sessionId,
      status: loaded.data.run.status,
    },
    tools: runTranscriptToolDetailsProject(loaded.data.run.id, projected.data),
    transcript: transcript.data,
  }
  const parsed = v.safeParse(runDetailResponseSchema, response)
  if (!parsed.success)
    return createResultErrorCode(
      "runRepositoryDetailLoad",
      "The run detail response is invalid.",
      runErrorCodes.detailInvalid,
    )
  return createResult(parsed.output)
}
