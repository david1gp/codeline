import { createResult, type Result } from "@adaptive-ds/result"
import { and, count, desc, eq, isNull, max, sql } from "drizzle-orm"
import * as v from "valibot"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { sessionTable } from "../../session/db/sessionTable.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { runChildAdmissionResolve } from "../actions/runChildAdmissionResolve.js"
import { runDelegationHistoryToolProjectionPersist } from "../actions/runDelegationHistoryToolProjectionPersist.js"
import { runExecutionManifestChildResolve } from "../actions/runExecutionManifestChildResolve.js"
import { runExecutionManifestToolDefaultsResolve } from "../actions/runExecutionManifestToolDefaultsResolve.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunBudget, runBudgetSchema } from "../schema/runBudgetSchema.js"
import type { RunChildAdmission } from "../schema/runChildAdmissionSchema.js"
import { type RunChildCreateInput, runChildCreateInputSchema } from "../schema/runChildCreateInputSchema.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import { runExecutionSnapshotSchema } from "../schema/runExecutionSnapshotSchema.js"
import { attemptTable } from "./attemptTable.js"
import { runDelegationTable } from "./runDelegationTable.js"
import { runActiveStateRepositoryUpsert } from "./runActiveStateRepositoryUpsert.js"
import { runHistoryEntryPayloadCreate } from "./runHistoryEntryPayloadCreate.js"
import { runTable } from "./runTable.js"
import { sessionHistoryEntryRepositoryUpsert } from "../../session/db/sessionHistoryEntryRepositoryUpsert.js"

type RunChildCreateResult = {
  admission: RunChildAdmission | null
  attempt: typeof attemptTable.$inferSelect
  created: boolean
  delegation: typeof runDelegationTable.$inferSelect
  run: typeof runTable.$inferSelect
}

type RunRepositoryChildCreateOptions = {
  beforeAdmissionCommit?: () => Promise<void>
  attemptId?: string
  delegationId?: string
  id?: string
  now?: () => Date
}

type RunRepositoryChildAdmissionState = {
  admission: RunChildAdmission
  currentAttempt: typeof attemptTable.$inferSelect
  parent: typeof runTable.$inferSelect
  root: typeof runTable.$inferSelect
}

type RunRepositoryChildTarget = {
  agentId: string
  serverId: string
}

function jsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

function runRepositoryChildTaskCanonicalize(task: string): string {
  return task.trim()
}

function runRepositoryChildSnapshotPolicyValidate(
  parentSnapshot: RunExecutionSnapshot,
  childSnapshot: RunExecutionSnapshot,
  explicit: boolean,
): Result<void> {
  const op = "runRepositoryChildCreate"
  if (childSnapshot.executionManifest === undefined) {
    if (explicit && parentSnapshot.executionManifest !== undefined)
      return runResultCreateError(
        op,
        "The explicit child execution manifest is required.",
        runErrorCodes.childToolEscalation,
      )
    return createResult(undefined)
  }
  if (childSnapshot.executionManifest.tools.primary.agentId !== childSnapshot.target.agentId)
    return runResultCreateError(
      op,
      "The child execution manifest primary agent does not match the child target.",
      runErrorCodes.childSnapshotInvalid,
    )
  const configurationTools = runExecutionManifestToolDefaultsResolve(
    childSnapshot.executionManifest.tools.primary.tools,
  )
  if (jsonCanonicalize(childSnapshot.configuration.tools) !== jsonCanonicalize(configurationTools))
    return runResultCreateError(
      op,
      "The child configuration tools do not match the immutable execution manifest.",
      runErrorCodes.childToolEscalation,
    )
  if (
    parentSnapshot.executionManifest !== undefined &&
    jsonCanonicalize(childSnapshot.executionManifest.instructions) !==
      jsonCanonicalize(parentSnapshot.executionManifest.instructions)
  )
    return runResultCreateError(
      op,
      "The child instruction snapshot does not match the immutable parent instruction snapshot.",
      runErrorCodes.childSnapshotInvalid,
    )
  if (
    parentSnapshot.executionManifest !== undefined &&
    jsonCanonicalize(childSnapshot.executionManifest.skills) !==
      jsonCanonicalize(parentSnapshot.executionManifest.skills)
  )
    return runResultCreateError(
      op,
      "The child skill snapshot does not match the immutable parent skill snapshot.",
      runErrorCodes.childSnapshotInvalid,
    )
  if (!explicit) return createResult(undefined)

  const expectedManifest = runExecutionManifestChildResolve(
    parentSnapshot.executionManifest,
    childSnapshot.target.agentId,
  )
  if (!expectedManifest.success) return expectedManifest
  if (jsonCanonicalize(childSnapshot.executionManifest) !== jsonCanonicalize(expectedManifest.data))
    return runResultCreateError(
      op,
      "The explicit child execution manifest is not the persisted selectable-subagent manifest.",
      runErrorCodes.childToolEscalation,
    )
  return createResult(undefined)
}

async function runRepositoryChildExistingLoad(
  transaction: DatabaseExecutor,
  userId: string,
  sessionId: string,
  delegation: typeof runDelegationTable.$inferSelect,
  expectedTarget?: RunRepositoryChildTarget,
  parentSnapshot?: RunExecutionSnapshot,
): Promise<Result<RunChildCreateResult>> {
  const op = "runRepositoryChildCreate"
  const [existingRun] = await transaction
    .select()
    .from(runTable)
    .where(and(eq(runTable.id, delegation.childRunId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
    .limit(1)
  if (existingRun === undefined)
    return runResultCreateError(op, "The existing child run could not be found.", runErrorCodes.childRunNotFound)
  if (expectedTarget !== undefined) {
    const parsedSnapshot = v.safeParse(runExecutionSnapshotSchema, existingRun.snapshot)
    if (!parsedSnapshot.success)
      return runResultCreateError(
        op,
        "The existing child execution snapshot is invalid.",
        runErrorCodes.childSnapshotInvalid,
      )
    if (parentSnapshot?.executionManifest !== undefined && parsedSnapshot.output.executionManifest === undefined)
      return runResultCreateError(
        op,
        "The existing child execution manifest is required for a manifest-bearing lineage.",
        runErrorCodes.childToolEscalation,
      )
    if (
      parsedSnapshot.output.target.agentId !== expectedTarget.agentId ||
      parsedSnapshot.output.target.serverId !== expectedTarget.serverId
    ) {
      return runResultCreateError(
        op,
        "The delegation key conflicts with a different agent.",
        runErrorCodes.delegationConflict,
      )
    }
  }

  const [existingAttempt] = await transaction
    .select()
    .from(attemptTable)
    .where(
      and(
        eq(attemptTable.runId, existingRun.id),
        eq(attemptTable.sessionId, sessionId),
        eq(attemptTable.userId, userId),
      ),
    )
    .orderBy(desc(attemptTable.ordinal))
    .limit(1)
  if (existingAttempt === undefined)
    return runResultCreateError(
      op,
      "The existing child attempt could not be found.",
      runErrorCodes.childAttemptNotFound,
    )

  return createResult({
    admission: null,
    attempt: existingAttempt,
    created: false,
    delegation,
    run: existingRun,
  })
}

async function runRepositoryChildAdmissionStateRead(
  transaction: DatabaseExecutor,
  userId: string,
  sessionId: string,
  parentRunId: string,
  parentAttemptId: string,
  rootRunId: string,
  budget: RunBudget,
  depth: number,
  now: Date,
): Promise<Result<RunRepositoryChildAdmissionState>> {
  const op = "runRepositoryChildCreate"
  const [root] = await transaction
    .select()
    .from(runTable)
    .where(and(eq(runTable.id, rootRunId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
    .limit(1)
  if (root === undefined) return runResultCreateError(op, "The root run could not be found.", runErrorCodes.notFound)

  const [parent] = await transaction
    .select()
    .from(runTable)
    .where(and(eq(runTable.id, parentRunId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
    .limit(1)
  if (parent === undefined)
    return runResultCreateError(op, "The parent run could not be found.", runErrorCodes.notFound)

  const [currentAttempt] = await transaction
    .select()
    .from(attemptTable)
    .where(
      and(
        eq(attemptTable.id, parentAttemptId),
        eq(attemptTable.runId, parentRunId),
        eq(attemptTable.sessionId, sessionId),
        eq(attemptTable.userId, userId),
      ),
    )
    .limit(1)
  if (currentAttempt === undefined)
    return runResultCreateError(op, "The parent attempt could not be found.", runErrorCodes.childAttemptNotFound)

  const [latestAttempt] = await transaction
    .select({ id: attemptTable.id })
    .from(attemptTable)
    .where(
      and(eq(attemptTable.runId, parentRunId), eq(attemptTable.sessionId, sessionId), eq(attemptTable.userId, userId)),
    )
    .orderBy(desc(attemptTable.ordinal))
    .limit(1)
  if (latestAttempt === undefined)
    return runResultCreateError(op, "The parent attempt could not be found.", runErrorCodes.childAttemptNotFound)
  if (latestAttempt.id !== parentAttemptId)
    return runResultCreateError(
      op,
      "The parent attempt is not the current run attempt.",
      runErrorCodes.parentAttemptNotCurrent,
    )
  if (
    parent.status !== currentAttempt.status ||
    jsonCanonicalize(parent.failure) !== jsonCanonicalize(currentAttempt.failure) ||
    jsonCanonicalize(parent.snapshot) !== jsonCanonicalize(currentAttempt.snapshot) ||
    jsonCanonicalize(parent.budget) !== jsonCanonicalize(currentAttempt.budget)
  ) {
    return runResultCreateError(
      op,
      "The parent run and current attempt are inconsistent.",
      runErrorCodes.stateInconsistent,
    )
  }

  const [descendantState] = await transaction
    .select({ descendantCount: count(runDelegationTable.id) })
    .from(runDelegationTable)
    .where(eq(runDelegationTable.rootRunId, root.id))
  const admission = runChildAdmissionResolve({
    attemptStatus: currentAttempt.status,
    budget,
    cancelled: root.cancellationRequestedAt !== null || parent.cancellationRequestedAt !== null,
    deadlineAt: root.deadlineAt.getTime(),
    depth,
    descendantCount: descendantState?.descendantCount ?? 0,
    now: now.getTime(),
    parentStatus: parent.status,
  })
  if (!admission.success) return admission
  return createResult({
    admission: admission.data,
    currentAttempt,
    parent,
    root,
  })
}

async function runRepositoryChildAdmissionGuard(
  transaction: DatabaseExecutor,
  root: typeof runTable.$inferSelect,
  parent: typeof runTable.$inferSelect,
  currentAttempt: typeof attemptTable.$inferSelect,
): Promise<Result<boolean>> {
  const [guardedParent] = await transaction
    .update(runTable)
    .set({ id: sql`${runTable.id}` })
    .where(and(eq(runTable.id, parent.id), eq(runTable.status, "running"), isNull(runTable.cancellationRequestedAt)))
    .returning({ id: runTable.id })
  if (guardedParent === undefined) return createResult(false)

  if (root.id !== parent.id) {
    const [guardedRoot] = await transaction
      .update(runTable)
      .set({ id: sql`${runTable.id}` })
      .where(and(eq(runTable.id, root.id), isNull(runTable.cancellationRequestedAt)))
      .returning({ id: runTable.id })
    if (guardedRoot === undefined) return createResult(false)
  }

  const [guardedAttempt] = await transaction
    .update(attemptTable)
    .set({ id: sql`${attemptTable.id}` })
    .where(
      and(
        eq(attemptTable.id, currentAttempt.id),
        eq(attemptTable.runId, parent.id),
        eq(attemptTable.status, "running"),
      ),
    )
    .returning({ id: attemptTable.id })
  if (guardedAttempt === undefined) return createResult(false)
  return createResult(true)
}

export async function runRepositoryChildCreate(
  database: DatabaseExecutor,
  userId: string,
  sessionId: string,
  input: RunChildCreateInput,
  options: RunRepositoryChildCreateOptions = {},
): Promise<Result<RunChildCreateResult>> {
  const op = "runRepositoryChildCreate"
  const parsedInput = v.safeParse(runChildCreateInputSchema, input)
  if (!parsedInput.success)
    return runResultCreateError(op, "The child run creation input is invalid.", runErrorCodes.invalidInput)

  return databaseExecutorTransactionRun<RunChildCreateResult>(database, async (transaction) => {
    try {
      const [parentDelegation] = await transaction
        .select({ depth: runDelegationTable.depth, rootRunId: runDelegationTable.rootRunId })
        .from(runDelegationTable)
        .where(
          and(
            eq(runDelegationTable.childRunId, parsedInput.output.parentRunId),
            eq(runDelegationTable.sessionId, sessionId),
            eq(runDelegationTable.userId, userId),
          ),
        )
        .limit(1)
      const rootRunId = parentDelegation?.rootRunId ?? parsedInput.output.parentRunId

      const [root] = await transaction
        .select()
        .from(runTable)
        .where(and(eq(runTable.id, rootRunId), eq(runTable.sessionId, sessionId), eq(runTable.userId, userId)))
        .limit(1)
      if (root === undefined)
        return runResultCreateError(op, "The root run could not be found.", runErrorCodes.notFound)

      const [parent] = await transaction
        .select()
        .from(runTable)
        .where(
          and(
            eq(runTable.id, parsedInput.output.parentRunId),
            eq(runTable.sessionId, sessionId),
            eq(runTable.userId, userId),
          ),
        )
        .limit(1)
      if (parent === undefined)
        return runResultCreateError(op, "The parent run could not be found.", runErrorCodes.notFound)

      const [existingDelegation] = await transaction
        .select()
        .from(runDelegationTable)
        .where(
          and(
            eq(runDelegationTable.parentRunId, parent.id),
            eq(runDelegationTable.parentAttemptId, parsedInput.output.parentAttemptId),
            eq(runDelegationTable.delegationKey, parsedInput.output.delegationKey),
            eq(runDelegationTable.sessionId, sessionId),
            eq(runDelegationTable.userId, userId),
          ),
        )
        .limit(1)
      if (existingDelegation !== undefined) {
        if (runRepositoryChildTaskCanonicalize(existingDelegation.task) !== parsedInput.output.task) {
          return runResultCreateError(
            op,
            "The delegation key conflicts with a different task.",
            runErrorCodes.delegationConflict,
          )
        }
        const parsedParentSnapshot = v.safeParse(runExecutionSnapshotSchema, parent.snapshot)
        if (!parsedParentSnapshot.success)
          return runResultCreateError(
            op,
            "The parent execution snapshot is invalid.",
            runErrorCodes.childSnapshotInvalid,
          )
        const requestedSnapshot = parsedInput.output.snapshot
        if (requestedSnapshot !== undefined) {
          if (requestedSnapshot.target.serverId !== parsedParentSnapshot.output.target.serverId)
            return runResultCreateError(
              op,
              "The child execution snapshot server does not match the parent.",
              runErrorCodes.childTargetMismatch,
            )
          const requestedSnapshotPolicy = runRepositoryChildSnapshotPolicyValidate(
            parsedParentSnapshot.output,
            requestedSnapshot,
            true,
          )
          if (!requestedSnapshotPolicy.success) return requestedSnapshotPolicy
        }
        const requestedTarget = requestedSnapshot?.target
        const existing =
          requestedTarget !== undefined
            ? await runRepositoryChildExistingLoad(
                transaction,
                userId,
                sessionId,
                existingDelegation,
                requestedTarget,
                parsedParentSnapshot.output,
              )
            : await runRepositoryChildExistingLoad(
                transaction,
                userId,
                sessionId,
                existingDelegation,
                parsedParentSnapshot.output.target,
                parsedParentSnapshot.output,
              )
        if (!existing.success) return existing
        const projected = await runDelegationHistoryToolProjectionPersist(
          transaction,
          userId,
          sessionId,
          existing.data.delegation,
        )
        if (!projected.success) return projected
        return createResult({ ...existing.data })
      }

      const [currentAttempt] = await transaction
        .select()
        .from(attemptTable)
        .where(
          and(
            eq(attemptTable.runId, parent.id),
            eq(attemptTable.sessionId, sessionId),
            eq(attemptTable.userId, userId),
          ),
        )
        .orderBy(desc(attemptTable.ordinal))
        .limit(1)
      if (currentAttempt === undefined)
        return runResultCreateError(op, "The parent attempt could not be found.", runErrorCodes.childAttemptNotFound)
      if (currentAttempt.id !== parsedInput.output.parentAttemptId) {
        return runResultCreateError(
          op,
          "The parent attempt is not the current run attempt.",
          runErrorCodes.parentAttemptNotCurrent,
        )
      }
      if (currentAttempt.userId !== userId || currentAttempt.sessionId !== sessionId) {
        return runResultCreateError(
          op,
          "The parent attempt ownership is inconsistent.",
          runErrorCodes.stateInconsistent,
        )
      }
      if (
        parent.status !== currentAttempt.status ||
        jsonCanonicalize(parent.failure) !== jsonCanonicalize(currentAttempt.failure) ||
        jsonCanonicalize(parent.snapshot) !== jsonCanonicalize(currentAttempt.snapshot) ||
        jsonCanonicalize(parent.budget) !== jsonCanonicalize(currentAttempt.budget)
      ) {
        return runResultCreateError(
          op,
          "The parent run and current attempt are inconsistent.",
          runErrorCodes.stateInconsistent,
        )
      }

      const parsedBudget = v.safeParse(runBudgetSchema, root.budget)
      if (!parsedBudget.success)
        return runResultCreateError(op, "The root run budget is invalid.", runErrorCodes.invalidInput)
      const parsedSnapshot = v.safeParse(runExecutionSnapshotSchema, parent.snapshot)
      if (!parsedSnapshot.success)
        return runResultCreateError(op, "The parent execution snapshot is invalid.", runErrorCodes.childSnapshotInvalid)
      const childSnapshot = parsedInput.output.snapshot ?? parsedSnapshot.output
      if (childSnapshot.target.serverId !== parsedSnapshot.output.target.serverId) {
        return runResultCreateError(
          op,
          "The child execution snapshot server does not match the parent.",
          runErrorCodes.childTargetMismatch,
        )
      }

      const matchingDelegations = await transaction
        .select({ childSnapshot: runTable.snapshot, delegation: runDelegationTable })
        .from(runDelegationTable)
        .innerJoin(runTable, eq(runTable.id, runDelegationTable.childRunId))
        .where(
          and(
            eq(runDelegationTable.parentRunId, parent.id),
            eq(runDelegationTable.parentAttemptId, parsedInput.output.parentAttemptId),
            eq(runDelegationTable.sessionId, sessionId),
            eq(runDelegationTable.userId, userId),
          ),
        )

      const matchingDelegation = matchingDelegations.find((candidate) => {
        if (runRepositoryChildTaskCanonicalize(candidate.delegation.task) !== parsedInput.output.task) return false
        const parsedCandidateSnapshot = v.safeParse(runExecutionSnapshotSchema, candidate.childSnapshot)
        if (!parsedCandidateSnapshot.success) return false
        return (
          parsedCandidateSnapshot.output.target.agentId === childSnapshot.target.agentId &&
          parsedCandidateSnapshot.output.target.serverId === childSnapshot.target.serverId
        )
      })
      if (matchingDelegation !== undefined) {
        const existing = await runRepositoryChildExistingLoad(
          transaction,
          userId,
          sessionId,
          matchingDelegation.delegation,
          childSnapshot.target,
          parsedSnapshot.output,
        )
        if (!existing.success) return existing
        const projected = await runDelegationHistoryToolProjectionPersist(
          transaction,
          userId,
          sessionId,
          existing.data.delegation,
        )
        if (!projected.success) return projected
        return existing
      }

      const now = options.now?.() ?? new Date()
      if (Number.isNaN(now.getTime()))
        return runResultCreateError(op, "The child creation clock is invalid.", runErrorCodes.clockInvalid)

      const [descendantState] = await transaction
        .select({
          descendantCount: count(runDelegationTable.id),
          latestRootOrdinal: max(runDelegationTable.rootOrdinal),
        })
        .from(runDelegationTable)
        .where(eq(runDelegationTable.rootRunId, root.id))
      const depth = parentDelegation?.depth ?? 0
      const admission = runChildAdmissionResolve({
        attemptStatus: currentAttempt.status,
        budget: parsedBudget.output,
        cancelled: root.cancellationRequestedAt !== null || parent.cancellationRequestedAt !== null,
        deadlineAt: root.deadlineAt.getTime(),
        depth,
        descendantCount: descendantState?.descendantCount ?? 0,
        now: now.getTime(),
        parentStatus: parent.status,
      })
      if (!admission.success) return admission
      if (admission.data.decision !== "admit") {
        return runResultCreateError(
          op,
          `The child run was not admitted: ${admission.data.reason}.`,
          runErrorCodes.childNotAdmitted,
        )
      }

      const childSnapshotPolicy = runRepositoryChildSnapshotPolicyValidate(
        parsedSnapshot.output,
        childSnapshot,
        parsedInput.output.snapshot !== undefined,
      )
      if (!childSnapshotPolicy.success) return childSnapshotPolicy

      const boundary = await runRepositoryChildAdmissionStateRead(
        transaction,
        userId,
        sessionId,
        parent.id,
        parsedInput.output.parentAttemptId,
        root.id,
        parsedBudget.output,
        depth,
        now,
      )
      if (!boundary.success) return boundary
      if (boundary.data.admission.decision !== "admit") {
        return runResultCreateError(
          op,
          `The child run was not admitted: ${boundary.data.admission.reason}.`,
          runErrorCodes.childNotAdmitted,
        )
      }
      await options.beforeAdmissionCommit?.()
      const guarded = await runRepositoryChildAdmissionGuard(
        transaction,
        boundary.data.root,
        boundary.data.parent,
        boundary.data.currentAttempt,
      )
      if (!guarded.success) return guarded
      if (!guarded.data) {
        const observed = await runRepositoryChildAdmissionStateRead(
          transaction,
          userId,
          sessionId,
          parent.id,
          parsedInput.output.parentAttemptId,
          root.id,
          parsedBudget.output,
          depth,
          new Date(),
        )
        if (!observed.success) return observed
        if (observed.data.admission.decision !== "admit") {
          return runResultCreateError(
            op,
            `The child run was not admitted: ${observed.data.admission.reason}.`,
            runErrorCodes.childNotAdmitted,
          )
        }
        return runResultCreateError(
          op,
          "The child run admission changed before persistence.",
          runErrorCodes.childNotAdmitted,
        )
      }

      const rootOrdinal = (descendantState?.latestRootOrdinal ?? 0) + 1
      const childRunId = options.id ?? uuidv7()
      const childStreamId = `run-child:${childRunId}`
      const [childRun] = await transaction
        .insert(runTable)
        .values({
          budget: parsedBudget.output,
          clientRunId: `child-run:${childRunId}`,
          createdAt: now,
          deadlineAt: root.deadlineAt,
          failure: null,
          id: childRunId,
          sessionId,
          snapshot: childSnapshot,
          status: "accepted",
          streamId: childStreamId,
          updatedAt: now,
          userId,
        })
        .returning()
      if (childRun === undefined)
        return runResultCreateError(op, "The child run could not be created.", runErrorCodes.childCreateFailed)

      const [childAttempt] = await transaction
        .insert(attemptTable)
        .values({
          budget: parsedBudget.output,
          failure: null,
          id: options.attemptId ?? uuidv7(),
          ordinal: 1,
          runId: childRunId,
          sessionId,
          snapshot: childSnapshot,
          status: "accepted",
          streamId: childStreamId,
          updatedAt: now,
          userId,
        })
        .returning()
      if (childAttempt === undefined)
        return runResultCreateError(
          op,
          "The initial child attempt could not be created.",
          runErrorCodes.childPersistFailed,
        )

      const childHistoryEntry = await sessionHistoryEntryRepositoryUpsert(transaction, userId, sessionId, {
        id: childRun.id,
        kind: "run",
        payload: runHistoryEntryPayloadCreate({ id: childRun.id, status: "accepted" }),
        sourceId: childRun.id,
        sourceType: "run",
      })
      if (!childHistoryEntry.success) return childHistoryEntry

      const childActiveState = await runActiveStateRepositoryUpsert(transaction, userId, sessionId, childRun.id, {
        status: "accepted",
      })
      if (!childActiveState.success) return childActiveState

      const [delegation] = await transaction
        .insert(runDelegationTable)
        .values({
          childRunId,
          createdAt: now,
          delegationKey: parsedInput.output.delegationKey,
          depth: depth + 1,
          finalizedResult: null,
          id: options.delegationId ?? uuidv7(),
          parentAttemptId: currentAttempt.id,
          parentRunId: parent.id,
          rootOrdinal,
          rootRunId: root.id,
          sessionId,
          task: parsedInput.output.task,
          updatedAt: now,
          userId,
        })
        .returning()
      if (delegation === undefined)
        return runResultCreateError(op, "The child delegation could not be created.", runErrorCodes.childPersistFailed)

      const projected = await runDelegationHistoryToolProjectionPersist(transaction, userId, sessionId, delegation)
      if (!projected.success) return projected

      const [updatedSession] = await transaction
        .update(sessionTable)
        .set({ revision: sql`${sessionTable.revision} + 1`, updatedAt: now })
        .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, userId)))
        .returning({ id: sessionTable.id })
      if (updatedSession === undefined)
        return runResultCreateError(
          op,
          "The session revision could not be updated.",
          runErrorCodes.sessionRevisionUpdateFailed,
        )

      return createResult({
        admission: admission.data,
        attempt: childAttempt,
        created: true,
        delegation,
        run: childRun,
      })
    } catch (_error) {
      return runResultCreateError(op, "The child run could not be persisted.", runErrorCodes.childPersistFailed)
    }
  })
}
