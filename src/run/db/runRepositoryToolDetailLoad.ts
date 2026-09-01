import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import * as v from "valibot"
import type { RunToolDetailResponse } from "../api/runToolDetailResponseSchema.js"
import { runToolDetailResponseSchema } from "../api/runToolDetailResponseSchema.js"
import { runActiveDetailSchema, type RunActiveDetail } from "../api/runActiveDetailSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runStatusSchema } from "../schema/runStatusSchema.js"
import { runFinalizedDetailRepositoryLoad } from "./runFinalizedDetailRepositoryLoad.js"

export async function runRepositoryToolDetailLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
  detailId: string,
): Promise<Result<RunToolDetailResponse>> {
  const op = "runRepositoryToolDetailLoad"
  const loaded = await runFinalizedDetailRepositoryLoad(database, userId, organizationId, sessionId, runId)
  if (!loaded.success) return loaded
  const runStatus = v.safeParse(runStatusSchema, loaded.data.run.status)
  if (!runStatus.success)
    return createResultErrorCode(op, "The run status is invalid.", runErrorCodes.toolDetailInvalid)

  if (runStatus.output === "accepted" || runStatus.output === "running") {
    if (loaded.data.activeState !== null && loaded.data.activeState.status !== runStatus.output)
      return createResultErrorCode(op, "The active run state is inconsistent.", runErrorCodes.toolDetailInvalid)
    let activeDetail: RunActiveDetail | null = null
    if (loaded.data.activeState !== null) {
      const parsedActiveDetail = v.safeParse(runActiveDetailSchema, {
        failure: loaded.data.activeState.failure,
        lastSequence: loaded.data.activeState.lastSequence,
        partialText: loaded.data.activeState.partialText,
      })
      if (!parsedActiveDetail.success)
        return createResultErrorCode(op, "The active tool detail is invalid.", runErrorCodes.toolDetailInvalid)
      activeDetail = parsedActiveDetail.output
    }
    const response = v.safeParse(runToolDetailResponseSchema, {
      detail: activeDetail,
      detailId,
      kind: "active",
      run: { id: loaded.data.run.id, sessionId: loaded.data.run.sessionId, status: runStatus.output },
    })
    if (!response.success)
      return createResultErrorCode(op, "The active tool detail response is invalid.", runErrorCodes.toolDetailInvalid)
    return createResult(response.output)
  }

  if (loaded.data.finalizedDetail === null)
    return createResultErrorCode(op, "The finalized tool detail could not be found.", runErrorCodes.toolDetailInvalid)
  const tool = loaded.data.finalizedDetail.tools.find(
    (candidate) => candidate.detailId === detailId || candidate.toolCallId === detailId,
  )
  if (tool === undefined)
    return createResultErrorCode(op, "The tool detail could not be found.", runErrorCodes.toolNotFound)
  const response = v.safeParse(runToolDetailResponseSchema, {
    detail: {
      runId: loaded.data.run.id,
      sessionId: loaded.data.run.sessionId,
      tool,
    },
    kind: "finalized",
  })
  if (!response.success)
    return createResultErrorCode(op, "The tool detail response is invalid.", runErrorCodes.toolDetailInvalid)
  return createResult(response.output)
}
