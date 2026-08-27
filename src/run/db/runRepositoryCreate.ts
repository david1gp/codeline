import { createResult, type Result } from "@adaptive-ds/result"
import { and, desc, eq } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionExecutionSelectionCanonicalize } from "../../session/actions/sessionExecutionSelectionCanonicalize.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { runExecutionManifestSelectionResolve } from "../actions/runExecutionManifestSelectionResolve.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { runBudgetSchema } from "../schema/runBudgetSchema.js"
import { type RunCreateInput, runCreateInputSchema } from "../schema/runCreateInputSchema.js"
import { runExecutionManifestSchema } from "../schema/runExecutionManifestSchema.js"
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

function runRepositoryExecutionManifestPolicyValidate(
  session: {
    executionManifest: unknown
    executionSelection: unknown
    instructionSnapshot: unknown
    primaryAgentId: string
    skillSelection: unknown
  },
  snapshot: RunCreateInput["snapshot"],
): Result<void> {
  const op = "runRepositoryCreate"
  if (snapshot.executionManifest !== undefined) {
    if (snapshot.executionManifest.tools.primary.agentId !== snapshot.target.agentId)
      return runResultCreateError(
        op,
        "The run execution manifest primary agent does not match the run target.",
        runErrorCodes.executionSnapshotInvalid,
      )
    const configurationTools = snapshot.configuration.tools
    const manifestTools = {
      bash: snapshot.executionManifest.tools.primary.tools.includes("bash"),
      webfetch: snapshot.executionManifest.tools.primary.tools.includes("webfetch"),
    }
    if (jsonCanonicalize(configurationTools) !== jsonCanonicalize(manifestTools))
      return runResultCreateError(
        op,
        "The run configuration tools do not match the immutable execution manifest.",
        runErrorCodes.executionSnapshotInvalid,
      )
  }

  const selection = sessionExecutionSelectionCanonicalize(session.executionSelection, session.primaryAgentId)
  if (!selection.success)
    return runResultCreateError(
      op,
      "The persisted session execution selection is invalid.",
      runErrorCodes.executionSnapshotInvalid,
    )

  const persistedManifest = v.safeParse(runExecutionManifestSchema, session.executionManifest)
  const expectedManifest = runExecutionManifestSelectionResolve({
    agentInstructions: session.instructionSnapshot,
    command: persistedManifest.success ? persistedManifest.output.command : undefined,
    commandCatalogDigest: persistedManifest.success ? persistedManifest.output.commandCatalog.digest : undefined,
    primaryAgentId: session.primaryAgentId,
    selection: selection.data ?? {
      tools: {
        primary: { agentId: session.primaryAgentId, tools: snapshot.configuration.tools },
        selectableSubagents: [],
      },
      version: 1,
    },
    skillSelection: session.skillSelection,
  })
  if (!expectedManifest.success) return expectedManifest
  if (snapshot.executionManifest === undefined) {
    if (selection.data === null) return createResult(undefined)
    return runResultCreateError(
      op,
      "The run execution manifest does not match the persisted session execution selection.",
      runErrorCodes.executionSnapshotInvalid,
    )
  }
  if (
    session.executionManifest !== null &&
    jsonCanonicalize(snapshot.executionManifest) !== jsonCanonicalize(session.executionManifest)
  )
    return runResultCreateError(
      op,
      "The run execution manifest does not match the immutable session execution manifest.",
      runErrorCodes.executionSnapshotInvalid,
    )
  if (jsonCanonicalize(snapshot.executionManifest) !== jsonCanonicalize(expectedManifest.data))
    return runResultCreateError(
      op,
      "The run execution manifest does not match the persisted session execution selection.",
      runErrorCodes.executionSnapshotInvalid,
    )
  return createResult(undefined)
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
  if (!parsedInput.success)
    return runResultCreateError(op, "The run creation input is invalid.", runErrorCodes.invalidInput)
  const parsedBudget = v.safeParse(runBudgetSchema, parsedInput.output.budget ?? {})
  if (!parsedBudget.success) return runResultCreateError(op, "The run budget is invalid.", runErrorCodes.invalidInput)
  const createdAt = new Date()
  const deadlineAt = new Date(createdAt.getTime() + parsedBudget.output.maxDurationMs)

  return databaseExecutorTransactionRun<RunCreateResult>(database, async (transaction) => {
    try {
      const [session] = await transaction
        .select({
          executionSelection: sessionTable.executionSelection,
          executionManifest: sessionTable.executionManifest,
          instructionSnapshot: sessionTable.instructionSnapshot,
          id: sessionTable.id,
          primaryAgentId: sessionTable.primaryAgentId,
          serverId: sessionTable.serverId,
          skillSelection: sessionTable.skillSelection,
        })
        .from(sessionTable)
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .limit(1)
      if (session === undefined)
        return runResultCreateError(op, "The session could not be found.", runErrorCodes.sessionNotFound)
      if (
        session.serverId !== parsedInput.output.snapshot.target.serverId ||
        session.primaryAgentId !== parsedInput.output.snapshot.target.agentId
      ) {
        return runResultCreateError(
          op,
          "The run snapshot target does not match the session target.",
          runErrorCodes.snapshotTargetMismatch,
        )
      }

      const manifestPolicy = runRepositoryExecutionManifestPolicyValidate(session, parsedInput.output.snapshot)
      if (!manifestPolicy.success) return manifestPolicy

      const [existing] = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.sessionId, sessionId), eq(runTable.clientRunId, parsedInput.output.clientRunId)))
        .limit(1)
      if (existing !== undefined) {
        if (!runImmutableInputMatches(existing, { ...parsedInput.output, budget: parsedBudget.output })) {
          return runResultCreateError(
            op,
            "The client run ID conflicts with different immutable run input.",
            runErrorCodes.clientRunIdConflict,
          )
        }
        const [attempt] = await transaction
          .select()
          .from(attemptTable)
          .where(
            and(
              eq(attemptTable.runId, existing.id),
              eq(attemptTable.sessionId, sessionId),
              eq(attemptTable.userId, userId),
            ),
          )
          .orderBy(desc(attemptTable.ordinal))
          .limit(1)
        if (attempt === undefined)
          return runResultCreateError(op, "The run attempt could not be loaded.", runErrorCodes.attemptNotFound)
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
      if (run === undefined)
        return runResultCreateError(op, "The run could not be created.", runErrorCodes.createFailed)

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
      if (attempt === undefined)
        return runResultCreateError(
          op,
          "The initial run attempt could not be created.",
          runErrorCodes.attemptPersistenceFailed,
        )
      return createResult<RunCreateResult>({ created: true, run, attempt })
    } catch (_error) {
      return runResultCreateError(op, "The run could not be created.", runErrorCodes.createFailed)
    }
  })
}
