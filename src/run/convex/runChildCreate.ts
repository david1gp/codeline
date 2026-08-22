import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { runChildAdmissionResolve } from "../actions/runChildAdmissionResolve.js"
import { runBudgetSchema } from "../schema/runBudgetSchema.js"
import { runChildCreateInputSchema } from "../schema/runChildCreateInputSchema.js"
import { runExecutionSnapshotSchema } from "../schema/runExecutionSnapshotSchema.js"
import type { RunChildAdmission } from "../schema/runChildAdmissionSchema.js"
import { attemptDocumentPublic } from "./attemptDocumentPublic.js"
import type { AttemptRecord } from "./attemptRecord.js"
import { runDelegationDocumentPublic } from "./runDelegationDocumentPublic.js"
import type { RunDelegationRecord } from "./runDelegationRecord.js"
import { runDocumentPublic } from "./runDocumentPublic.js"
import type { RunRecord } from "./runRecord.js"
import { runJsonCanonicalize } from "./runJsonCanonicalize.js"

type RunMutationContext = Pick<GenericMutationCtx<any>, "db">

function taskCanonicalize(task: string): string {
  return task.trim()
}

async function existingChildLoad(
  context: RunMutationContext,
  userId: string,
  sessionId: string,
  delegation: RunDelegationRecord,
  expectedTarget: { agentId: string; serverId: string },
): Promise<
  Result<{ admission: null; attempt: AttemptRecord; created: false; delegation: RunDelegationRecord; run: RunRecord }>
> {
  const op = "runChildCreate"
  const rawRun = await context.db
    .query("runs")
    .withIndex("id", (query: any) => query.eq("id", delegation.childRunId))
    .first()
  if (rawRun === null || rawRun.sessionId !== sessionId || rawRun.userId !== userId)
    return createResultError(op, "The existing child run could not be found.")
  const parsedSnapshot = v.safeParse(runExecutionSnapshotSchema, rawRun.snapshot)
  if (!parsedSnapshot.success) return createResultError(op, "The existing child execution snapshot is invalid.")
  if (
    parsedSnapshot.output.target.agentId !== expectedTarget.agentId ||
    parsedSnapshot.output.target.serverId !== expectedTarget.serverId
  )
    return createResultError(op, "The delegation key conflicts with a different agent.")
  const rawAttempt = await context.db
    .query("attempts")
    .withIndex("runIdOrdinal", (query: any) => query.eq("runId", rawRun.id))
    .order("desc")
    .first()
  if (rawAttempt === null) return createResultError(op, "The existing child attempt could not be found.")
  return createResult({
    admission: null,
    attempt: attemptDocumentPublic(rawAttempt),
    created: false,
    delegation,
    run: runDocumentPublic(rawRun),
  })
}

export async function runChildCreate(
  context: RunMutationContext,
  userId: string,
  sessionId: string,
  input: unknown,
  now = Date.now(),
): Promise<
  Result<{
    admission: RunChildAdmission | null
    attempt: AttemptRecord
    created: boolean
    delegation: RunDelegationRecord
    run: RunRecord
  }>
> {
  const op = "runChildCreate"
  const parsedInput = v.safeParse(runChildCreateInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The child run creation input is invalid.")
  const task = taskCanonicalize(parsedInput.output.task)

  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const parentDelegationRaw = await context.db
      .query("runDelegations")
      .withIndex("childRunId", (query: any) => query.eq("childRunId", parsedInput.output.parentRunId))
      .first()
    const parentDelegation = parentDelegationRaw === null ? undefined : runDelegationDocumentPublic(parentDelegationRaw)
    if (
      parentDelegation !== undefined &&
      (parentDelegation.sessionId !== sessionId || parentDelegation.userId !== userId)
    )
      return createResultError(op, "The parent run could not be found.")
    const rootRunId = parentDelegation?.rootRunId ?? parsedInput.output.parentRunId
    const rawRoot = await context.db
      .query("runs")
      .withIndex("id", (query: any) => query.eq("id", rootRunId))
      .first()
    if (rawRoot === null || rawRoot.sessionId !== sessionId || rawRoot.userId !== userId)
      return createResultError(op, "The root run could not be found.")
    const rawParent = await context.db
      .query("runs")
      .withIndex("id", (query: any) => query.eq("id", parsedInput.output.parentRunId))
      .first()
    if (rawParent === null || rawParent.sessionId !== sessionId || rawParent.userId !== userId)
      return createResultError(op, "The parent run could not be found.")
    const parent = runDocumentPublic(rawParent)
    const root = runDocumentPublic(rawRoot)

    const existingRaw = await context.db
      .query("runDelegations")
      .withIndex("parentKey", (query: any) =>
        query
          .eq("parentRunId", parent.id)
          .eq("parentAttemptId", parsedInput.output.parentAttemptId)
          .eq("delegationKey", parsedInput.output.delegationKey),
      )
      .first()
    if (existingRaw !== null) {
      const existing = runDelegationDocumentPublic(existingRaw)
      if (existing.sessionId !== sessionId || existing.userId !== userId)
        return createResultError(op, "The delegation could not be found.")
      if (taskCanonicalize(existing.task) !== task)
        return createResultError(op, "The delegation key conflicts with a different task.")
      const parsedParentSnapshot = v.safeParse(runExecutionSnapshotSchema, parent.snapshot)
      if (!parsedParentSnapshot.success) return createResultError(op, "The parent execution snapshot is invalid.")
      const expectedTarget = parsedInput.output.snapshot?.target ?? parsedParentSnapshot.output.target
      return existingChildLoad(context, userId, sessionId, existing, expectedTarget)
    }

    const rawAttempt = await context.db
      .query("attempts")
      .withIndex("runIdOrdinal", (query: any) => query.eq("runId", parent.id))
      .order("desc")
      .first()
    if (rawAttempt === null) return createResultError(op, "The parent attempt could not be found.")
    const currentAttempt = attemptDocumentPublic(rawAttempt)
    if (currentAttempt.id !== parsedInput.output.parentAttemptId)
      return createResultError(op, "The parent attempt is not the current run attempt.")
    if (
      parent.status !== currentAttempt.status ||
      runJsonCanonicalize(parent.failure) !== runJsonCanonicalize(currentAttempt.failure) ||
      runJsonCanonicalize(parent.snapshot) !== runJsonCanonicalize(currentAttempt.snapshot) ||
      runJsonCanonicalize(parent.budget) !== runJsonCanonicalize(currentAttempt.budget)
    )
      return createResultError(op, "The parent run and current attempt are inconsistent.")

    const parsedBudget = v.safeParse(runBudgetSchema, root.budget)
    if (!parsedBudget.success) return createResultError(op, "The root run budget is invalid.")
    const parsedParentSnapshot = v.safeParse(runExecutionSnapshotSchema, parent.snapshot)
    if (!parsedParentSnapshot.success) return createResultError(op, "The parent execution snapshot is invalid.")
    const childSnapshot = parsedInput.output.snapshot ?? parsedParentSnapshot.output
    if (childSnapshot.target.serverId !== parsedParentSnapshot.output.target.serverId)
      return createResultError(op, "The child execution snapshot server does not match the parent.")

    const parentDelegations = (await context.db
      .query("runDelegations")
      .withIndex("parentAttempt", (query: any) =>
        query.eq("parentRunId", parent.id).eq("parentAttemptId", currentAttempt.id),
      )
      .collect()) as Array<RunDelegationRecord & { _id?: string }>
    for (const candidateRaw of parentDelegations) {
      const candidate = runDelegationDocumentPublic(candidateRaw)
      if (taskCanonicalize(candidate.task) !== task) continue
      const candidateRun = await context.db
        .query("runs")
        .withIndex("id", (query: any) => query.eq("id", candidate.childRunId))
        .first()
      const candidateSnapshot =
        candidateRun === null ? null : v.safeParse(runExecutionSnapshotSchema, candidateRun.snapshot)
      if (
        candidateSnapshot?.success &&
        candidateSnapshot.output.target.agentId === childSnapshot.target.agentId &&
        candidateSnapshot.output.target.serverId === childSnapshot.target.serverId
      )
        return existingChildLoad(context, userId, sessionId, candidate, childSnapshot.target)
    }

    const rootDelegations = await context.db
      .query("runDelegations")
      .withIndex("rootOrdinal", (query: any) => query.eq("rootRunId", root.id))
      .collect()
    const admission = runChildAdmissionResolve({
      attemptStatus: currentAttempt.status,
      budget: parsedBudget.output,
      cancelled: root.cancellationRequestedAt !== null || parent.cancellationRequestedAt !== null,
      deadlineAt: root.deadlineAt,
      depth: parentDelegation?.depth ?? 0,
      descendantCount: rootDelegations.length,
      now,
      parentStatus: parent.status,
    })
    if (!admission.success) return createResultError(op, admission.errorMessage)
    if (admission.data.decision !== "admit")
      return createResultError(op, `The child run was not admitted: ${admission.data.reason}.`)

    const rootOrdinal =
      Math.max(0, ...rootDelegations.map((delegation: { rootOrdinal: number }) => delegation.rootOrdinal)) + 1
    const childRunId = uuidv7()
    const childStreamId = `run-child:${childRunId}`
    const childRun = {
      budget: parsedBudget.output,
      clientRunId: `child-run:${childRunId}`,
      createdAt: now,
      deadlineAt: root.deadlineAt,
      id: childRunId,
      sessionId,
      snapshot: childSnapshot,
      status: "accepted" as const,
      streamId: childStreamId,
      updatedAt: now,
      userId,
    }
    await context.db.insert("runs", childRun)
    const childAttempt = {
      budget: parsedBudget.output,
      createdAt: now,
      id: uuidv7(),
      ordinal: 1,
      runId: childRunId,
      sessionId,
      snapshot: childSnapshot,
      status: "accepted" as const,
      streamId: childStreamId,
      updatedAt: now,
      userId,
    }
    await context.db.insert("attempts", childAttempt)
    const delegation = {
      childRunId,
      createdAt: now,
      delegationKey: parsedInput.output.delegationKey,
      depth: (parentDelegation?.depth ?? 0) + 1,
      id: uuidv7(),
      parentAttemptId: currentAttempt.id,
      parentRunId: parent.id,
      rootOrdinal,
      rootRunId: root.id,
      sessionId,
      task,
      updatedAt: now,
      userId,
    }
    await context.db.insert("runDelegations", delegation)
    return createResult({
      admission: admission.data,
      attempt: attemptDocumentPublic(childAttempt),
      created: true,
      delegation: runDelegationDocumentPublic(delegation),
      run: runDocumentPublic(childRun),
    })
  } catch (_error) {
    return createResultError(op, "The child run could not be persisted.")
  }
}
