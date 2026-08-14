import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, desc, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseClient, DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { runBudgetSchema } from "../schema/runBudgetSchema.js"
import { runCreateInputSchema, type RunCreateInput } from "../schema/runCreateInputSchema.js"
import { attemptTable } from "./attemptTable.js"
import { runTable } from "./runTable.js"

function jsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

function runImmutableInputMatches(
  run: typeof runTable.$inferSelect,
  input: { budget: unknown; snapshot: unknown; streamId: string },
): boolean {
  return (
    run.streamId === input.streamId &&
    jsonCanonicalize(run.snapshot) === jsonCanonicalize(input.snapshot) &&
    jsonCanonicalize(run.budget) === jsonCanonicalize(input.budget)
  )
}

type RunCreateResult = {
  created: boolean
  run: typeof runTable.$inferSelect
  attempt: typeof attemptTable.$inferSelect
}

export async function runRepositoryCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: RunCreateInput,
): Promise<Result<RunCreateResult>> {
  const op = "runRepositoryCreate"
  const parsedInput = v.safeParse(runCreateInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The run creation input is invalid.")
  const parsedBudget = v.safeParse(runBudgetSchema, parsedInput.output.budget ?? {})
  if (!parsedBudget.success) return createResultError(op, "The run budget is invalid.")
  const createdAt = new Date()
  const deadlineAt = new Date(createdAt.getTime() + parsedBudget.output.maxDurationMs)

  return databaseTransactionRun<RunCreateResult>(database as DatabaseClient, async (transaction) => {
    try {
      const [session] = await transaction
        .select({ id: sessionTable.id, primaryAgentId: sessionTable.primaryAgentId, serverId: sessionTable.serverId })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .for("update")
        .limit(1)
      if (session === undefined) return createResultError(op, "The session could not be found.")
      if (
        session.serverId !== parsedInput.output.snapshot.target.serverId ||
        session.primaryAgentId !== parsedInput.output.snapshot.target.agentId
      ) {
        return createResultError(op, "The run snapshot target does not match the session target.")
      }

      const [existing] = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.sessionId, sessionId), eq(runTable.clientRunId, parsedInput.output.clientRunId)))
        .for("update")
        .limit(1)
      if (existing !== undefined) {
        if (!runImmutableInputMatches(existing, { ...parsedInput.output, budget: parsedBudget.output })) {
          return createResultError(op, "The client run ID conflicts with different immutable run input.")
        }
        const [attempt] = await transaction
          .select()
          .from(attemptTable)
          .where(eq(attemptTable.runId, existing.id))
          .orderBy(desc(attemptTable.ordinal))
          .for("update")
          .limit(1)
        if (attempt === undefined) return createResultError(op, "The run attempt could not be loaded.")
        return createResult<RunCreateResult>({ created: false, run: existing, attempt })
      }

      const runId = uuidv7()
      const [run] = await transaction
        .insert(runTable)
        .values({
          budget: parsedBudget.output,
          clientRunId: parsedInput.output.clientRunId,
          createdAt,
          deadlineAt,
          failure: null,
          id: runId,
          sessionId,
          snapshot: parsedInput.output.snapshot,
          streamId: parsedInput.output.streamId,
          userId,
        })
        .returning()
      if (run === undefined) return createResultError(op, "The run could not be created.")

      const [attempt] = await transaction
        .insert(attemptTable)
        .values({
          budget: parsedBudget.output,
          failure: null,
          id: uuidv7(),
          ordinal: 1,
          runId,
          sessionId,
          snapshot: parsedInput.output.snapshot,
          streamId: parsedInput.output.streamId,
          userId,
        })
        .returning()
      if (attempt === undefined) return createResultError(op, "The initial run attempt could not be created.")
      return createResult<RunCreateResult>({ created: true, run, attempt })
    } catch (_error) {
      return createResultError(op, "The run could not be created.")
    }
  })
}
