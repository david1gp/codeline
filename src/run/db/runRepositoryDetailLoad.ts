import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import * as v from "valibot"
import { runActiveDetailSchema, type RunActiveDetail } from "../api/runActiveDetailSchema.js"
import { runDetailResponseSchema, type RunDetailResponse } from "../api/runDetailResponseSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"
import { runFinalizedDetailRepositoryLoad } from "./runFinalizedDetailRepositoryLoad.js"

export async function runRepositoryDetailLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
): Promise<Result<RunDetailResponse>> {
  const loaded = await runFinalizedDetailRepositoryLoad(database, userId, organizationId, sessionId, runId)
  if (!loaded.success) return loaded
  const op = "runRepositoryDetailLoad"
  const status = v.safeParse(runStatusSchema, loaded.data.run.status)
  if (!status.success) return createResultErrorCode(op, "The run status is invalid.", runErrorCodes.statusInvalid)

  if (status.output === "accepted" || status.output === "running") {
    if (loaded.data.activeState !== null && loaded.data.activeState.status !== status.output)
      return createResultErrorCode(op, "The active run state is inconsistent.", runErrorCodes.detailInvalid)
    let activeDetail: RunActiveDetail | null = null
    if (loaded.data.activeState !== null) {
      const parsedActiveDetail = v.safeParse(runActiveDetailSchema, {
        failure: loaded.data.activeState.failure,
        lastSequence: loaded.data.activeState.lastSequence,
        partialText: loaded.data.activeState.partialText,
      })
      if (!parsedActiveDetail.success)
        return createResultErrorCode(op, "The active run detail is invalid.", runErrorCodes.detailInvalid)
      activeDetail = parsedActiveDetail.output
    }
    const response = v.safeParse(runDetailResponseSchema, {
      detail: activeDetail,
      kind: "active",
      run: { id: loaded.data.run.id, sessionId: loaded.data.run.sessionId, status: status.output },
    })
    if (!response.success)
      return createResultErrorCode(op, "The active run detail response is invalid.", runErrorCodes.detailInvalid)
    return createResult(response.output)
  }

  if (loaded.data.finalizedDetail === null)
    return createResultErrorCode(op, "The finalized run detail could not be found.", runErrorCodes.detailInvalid)
  const response = {
    detail: {
      run: {
        cancellationKind: loaded.data.run.cancellationKind,
        failure: loaded.data.run.failure,
        id: loaded.data.run.id,
        sessionId: loaded.data.run.sessionId,
        status: status.output,
      },
      tools: loaded.data.finalizedDetail.tools,
      transcript: loaded.data.finalizedDetail.transcript,
    },
    kind: "finalized" as const,
  }
  const parsed = v.safeParse(runDetailResponseSchema, response)
  if (!parsed.success)
    return createResultErrorCode(op, "The run detail response is invalid.", runErrorCodes.detailInvalid)
  return createResult(parsed.output)
}
