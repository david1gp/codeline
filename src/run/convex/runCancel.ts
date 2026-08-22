import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import * as v from "valibot"
import { runCancelInputSchema } from "../schema/runCancelInputSchema.js"
import { runCancellationKindSchema } from "../schema/runCancellationKindSchema.js"
import { runDocumentPublic } from "./runDocumentPublic.js"
import type { RunRecord } from "./runRecord.js"

type RunMutationContext = Pick<GenericMutationCtx<any>, "db">
const nonterminalStatuses = ["accepted", "running"] as const

export async function runCancel(
  context: RunMutationContext,
  userId: string,
  sessionId: string,
  runId: string,
  input: unknown = {},
  now = Date.now(),
): Promise<Result<{ cancelledRunIds: string[]; changed: boolean; descendantsCancelled: number; run: RunRecord }>> {
  const op = "runCancel"
  const parsedInput = v.safeParse(runCancelInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The run cancellation input is invalid.")
  const parsedKind = v.safeParse(runCancellationKindSchema, parsedInput.output.kind)
  if (!parsedKind.success || parsedKind.output !== "requested")
    return createResultError(op, "The run cancellation kind is invalid.")

  try {
    const session = await context.db
      .query("sessions")
      .withIndex("userIdId", (query: any) => query.eq("userId", userId).eq("id", sessionId))
      .first()
    if (session === null) return createResultError(op, "The session could not be found.")
    const targetDelegation = await context.db
      .query("runDelegations")
      .withIndex("childRunId", (query: any) => query.eq("childRunId", runId))
      .first()
    const rootRunId = targetDelegation?.rootRunId ?? runId
    const rootDocument = await context.db
      .query("runs")
      .withIndex("id", (query: any) => query.eq("id", rootRunId))
      .first()
    if (rootDocument === null || rootDocument.sessionId !== sessionId || rootDocument.userId !== userId)
      return createResultError(op, "The run could not be found.")
    const targetDocument =
      rootRunId === runId
        ? rootDocument
        : await context.db
            .query("runs")
            .withIndex("id", (query: any) => query.eq("id", runId))
            .first()
    if (targetDocument === null || targetDocument.sessionId !== sessionId || targetDocument.userId !== userId)
      return createResultError(op, "The run could not be found.")

    const target = runDocumentPublic(targetDocument)
    if (
      !nonterminalStatuses.includes(target.status as (typeof nonterminalStatuses)[number]) ||
      target.cancellationKind === "ancestor"
    )
      return createResult({ cancelledRunIds: [], changed: false, descendantsCancelled: 0, run: target })

    const delegations = (await context.db
      .query("runDelegations")
      .withIndex("rootOrdinal", (query: any) => query.eq("rootRunId", rootRunId))
      .collect()) as Array<{ childRunId: string; parentRunId: string; sessionId: string; userId: string }>
    const childRunIdsByParent = new Map<string, string[]>()
    for (const delegation of delegations) {
      if (delegation.sessionId !== sessionId || delegation.userId !== userId) continue
      const childRunIds = childRunIdsByParent.get(delegation.parentRunId) ?? []
      childRunIds.push(delegation.childRunId)
      childRunIdsByParent.set(delegation.parentRunId, childRunIds)
    }
    const descendantRunIds: string[] = []
    const visited = new Set([target.id])
    const pending = [target.id]
    while (pending.length > 0) {
      const parentId = pending.pop()
      if (parentId === undefined) continue
      for (const childId of childRunIdsByParent.get(parentId) ?? []) {
        if (visited.has(childId)) continue
        visited.add(childId)
        descendantRunIds.push(childId)
        pending.push(childId)
      }
    }

    let changed = false
    let targetResult = target
    if (target.cancellationRequestedAt === null) {
      await context.db.patch("runs", targetDocument._id, {
        cancellationKind: "requested",
        cancellationRequestedAt: now,
        updatedAt: now,
      })
      targetResult = runDocumentPublic({
        ...targetDocument,
        cancellationKind: "requested",
        cancellationRequestedAt: now,
        updatedAt: now,
      })
      changed = true
    }
    let descendantsCancelled = 0
    const cancelledDescendantIds: string[] = []
    for (const descendantRunId of descendantRunIds) {
      const descendant = await context.db
        .query("runs")
        .withIndex("id", (query: any) => query.eq("id", descendantRunId))
        .first()
      if (
        descendant === null ||
        descendant.sessionId !== sessionId ||
        descendant.userId !== userId ||
        !nonterminalStatuses.includes(descendant.status as (typeof nonterminalStatuses)[number]) ||
        descendant.cancellationRequestedAt !== undefined
      )
        continue
      await context.db.patch("runs", descendant._id, {
        cancellationKind: "ancestor",
        cancellationRequestedAt: targetResult.cancellationRequestedAt ?? now,
        cancellationSourceRunId: target.id,
        updatedAt: now,
      })
      descendantsCancelled += 1
      cancelledDescendantIds.push(descendantRunId)
      changed = true
    }
    return createResult({
      cancelledRunIds: changed ? [target.id, ...cancelledDescendantIds] : [],
      changed,
      descendantsCancelled,
      run: targetResult,
    })
  } catch (_error) {
    return createResultError(op, "The run cancellation could not be persisted.")
  }
}
