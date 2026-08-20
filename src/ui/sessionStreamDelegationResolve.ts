import type { SessionStreamDelegation } from "./sessionStreamGroupsDerive.js"

function sessionStreamTargetResolve(snapshot: unknown): { agentId: string; serverId: string } | undefined {
  if (typeof snapshot !== "object" || snapshot === null) return undefined
  const target = (snapshot as Record<string, unknown>).target
  if (typeof target !== "object" || target === null) return undefined
  const agentId = (target as Record<string, unknown>).agentId
  const serverId = (target as Record<string, unknown>).serverId
  if (typeof agentId !== "string" || typeof serverId !== "string") return undefined
  const normalizedAgentId = agentId.trim()
  const normalizedServerId = serverId.trim()
  if (normalizedAgentId.length === 0 || normalizedServerId.length === 0) return undefined
  return { agentId: normalizedAgentId, serverId: normalizedServerId }
}

function sessionStreamRunTargetResolve(
  runId: string,
  runs: ReadonlyArray<{ id: string; snapshot?: unknown }>,
): { agentId: string; serverId: string } | undefined {
  return sessionStreamTargetResolve(runs.find((run) => run.id === runId)?.snapshot)
}

function sessionStreamTaskNormalize(task: string): string {
  return task.trim()
}

export function sessionStreamDelegationResolve(input: {
  activity: {
    agentId?: string
    serverId?: string
    task?: string
    toolCallId?: string
  }
  delegations: ReadonlyArray<SessionStreamDelegation>
  runs: ReadonlyArray<{ id: string; snapshot?: unknown }>
  scope: { parentAttemptId: string; parentRunId: string } | undefined
}): SessionStreamDelegation | undefined {
  if (input.activity.toolCallId === undefined || input.scope === undefined) return undefined

  const scoped = input.delegations.filter(
    (candidate) =>
      candidate.parentRunId === input.scope?.parentRunId && candidate.parentAttemptId === input.scope?.parentAttemptId,
  )
  const exact = scoped.find((candidate) => candidate.delegationKey === input.activity.toolCallId)
  const parentTarget = sessionStreamRunTargetResolve(input.scope.parentRunId, input.runs)
  const requestedTarget =
    input.activity.agentId === undefined && input.activity.serverId === undefined && parentTarget === undefined
      ? undefined
      : {
          agentId: (input.activity.agentId ?? parentTarget?.agentId)?.trim(),
          serverId: (input.activity.serverId ?? parentTarget?.serverId)?.trim(),
        }
  const hasRequestedTarget =
    requestedTarget?.agentId !== undefined &&
    requestedTarget.agentId.length > 0 &&
    requestedTarget.serverId !== undefined &&
    requestedTarget.serverId.length > 0

  if (exact !== undefined) {
    if (
      input.activity.task !== undefined &&
      sessionStreamTaskNormalize(exact.task) !== sessionStreamTaskNormalize(input.activity.task)
    )
      return undefined
    const exactTarget = sessionStreamRunTargetResolve(exact.childRunId, input.runs)
    if (
      exactTarget !== undefined &&
      ((requestedTarget?.agentId !== undefined &&
        requestedTarget.agentId.length > 0 &&
        exactTarget.agentId !== requestedTarget.agentId) ||
        (requestedTarget?.serverId !== undefined &&
          requestedTarget.serverId.length > 0 &&
          exactTarget.serverId !== requestedTarget.serverId))
    )
      return undefined
    return exact
  }

  if (input.activity.task === undefined || !hasRequestedTarget) return undefined
  return scoped.find((candidate) => {
    if (sessionStreamTaskNormalize(candidate.task) !== sessionStreamTaskNormalize(input.activity.task!)) return false
    const target = sessionStreamRunTargetResolve(candidate.childRunId, input.runs)
    return (
      target !== undefined && target.agentId === requestedTarget.agentId && target.serverId === requestedTarget.serverId
    )
  })
}
