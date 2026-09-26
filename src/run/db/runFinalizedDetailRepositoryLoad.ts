import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseReadTransactionRun } from "../../database/databaseReadTransactionRun.js"
import { organizationTable } from "../../identity/db/organizationTable.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runActiveStateTable } from "./runActiveStateTable.js"
import { runFinalizedDetailTable } from "./runFinalizedDetailTable.js"
import { runTable } from "./runTable.js"
import { runToolDetailSchema } from "../api/runToolDetailSchema.js"
import { runTranscriptSchema } from "../api/runTranscriptSchema.js"

type RunFinalizedDetailRepositoryLoadResult = {
  activeState: Pick<
    typeof runActiveStateTable.$inferSelect,
    "failure" | "lastSequence" | "partialText" | "status"
  > | null
  finalizedDetail: {
    tools: v.InferOutput<typeof runToolDetailSchema>[]
    transcript: v.InferOutput<typeof runTranscriptSchema>
  } | null
  run: typeof runTable.$inferSelect
}

const runFinalizedDetailToolsSchema = v.pipe(v.array(runToolDetailSchema), v.maxLength(1_000))

export async function runFinalizedDetailRepositoryLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  runId: string,
): Promise<Result<RunFinalizedDetailRepositoryLoadResult>> {
  const op = "runFinalizedDetailRepositoryLoad"
  if (userId.trim().length === 0 || organizationId.trim().length === 0)
    return runResultCreateError(op, "The authenticated run scope is required.", runErrorCodes.scopeRequired)
  if (sessionId.trim().length === 0 || runId.trim().length === 0)
    return runResultCreateError(op, "The session and run identifiers are required.", runErrorCodes.identifiersRequired)

  try {
    return await databaseReadTransactionRun(database, async (transaction) => {
      const [row] = await transaction
        .select({
          activeState: runActiveStateTable,
          finalizedDetail: runFinalizedDetailTable,
          run: runTable,
        })
        .from(runTable)
        .innerJoin(sessionTable, and(eq(runTable.sessionId, sessionTable.id), eq(runTable.userId, sessionTable.userId)))
        .innerJoin(serverTable, eq(sessionTable.serverId, serverTable.id))
        .innerJoin(
          organizationTable,
          and(eq(serverTable.organizationId, organizationTable.id), eq(organizationTable.id, organizationId)),
        )
        .leftJoin(
          runActiveStateTable,
          and(
            eq(runActiveStateTable.runId, runTable.id),
            eq(runActiveStateTable.sessionId, runTable.sessionId),
            eq(runActiveStateTable.userId, runTable.userId),
          ),
        )
        .leftJoin(
          runFinalizedDetailTable,
          and(
            eq(runFinalizedDetailTable.runId, runTable.id),
            eq(runFinalizedDetailTable.sessionId, runTable.sessionId),
            eq(runFinalizedDetailTable.userId, runTable.userId),
          ),
        )
        .where(and(eq(runTable.id, runId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .limit(1)
      if (row === undefined) return createResultErrorCode(op, "The run could not be found.", runErrorCodes.notFound)

      let finalizedDetail: RunFinalizedDetailRepositoryLoadResult["finalizedDetail"] = null
      if (row.finalizedDetail !== null) {
        const transcript = v.safeParse(runTranscriptSchema, row.finalizedDetail.transcript)
        const tools = v.safeParse(runFinalizedDetailToolsSchema, row.finalizedDetail.tools)
        if (!transcript.success || !tools.success)
          return createResultErrorCode(
            op,
            "The persisted finalized run detail is invalid.",
            runErrorCodes.detailInvalid,
          )
        finalizedDetail = { tools: tools.output, transcript: transcript.output }
      }

      return createResult({
        activeState:
          row.activeState === null
            ? null
            : {
                failure: row.activeState.failure,
                lastSequence: row.activeState.lastSequence,
                partialText: row.activeState.partialText,
                status: row.activeState.status,
              },
        finalizedDetail,
        run: row.run,
      })
    })
  } catch (_error) {
    return runResultCreateError(op, "The finalized run detail could not be loaded.", runErrorCodes.persistFailed)
  }
}
