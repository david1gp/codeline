import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { agentExecutionTargetSchema } from "../../agents/schema/agentExecutionTargetSchema.js"
import type { ConfigurationStore } from "../../configuration/configurationStore.js"
import { configurationStoreRead } from "../../configuration/configurationStoreRead.js"
import type { RunExecutionSnapshot } from "../schema/runExecutionSnapshotSchema.js"
import { runExecutionSnapshotSchema } from "../schema/runExecutionSnapshotSchema.js"

type RunExecutionSnapshotResolveOptions = {
  configurationStoreRead?: typeof configurationStoreRead
}

function runExecutionSnapshotDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value

  Object.freeze(value)
  for (const child of Object.values(value)) runExecutionSnapshotDeepFreeze(child)
  return value
}

export function runExecutionSnapshotResolve(
  target: unknown,
  store: ConfigurationStore,
  options: RunExecutionSnapshotResolveOptions = {},
): Result<RunExecutionSnapshot> {
  const op = "runExecutionSnapshotResolve"
  const parsedTarget = v.safeParse(agentExecutionTargetSchema, target)
  if (!parsedTarget.success) return createResultError(op, "The run execution target is invalid.")

  const read = (options.configurationStoreRead ?? configurationStoreRead)(store)
  if (!read.success) return createResultError(op, read.errorMessage)

  const entry = read.data.configuration.agentConfigurations.find(
    ({ target: configuredTarget }) =>
      configuredTarget.serverId === parsedTarget.output.serverId &&
      configuredTarget.agentId === parsedTarget.output.agentId,
  )
  if (entry === undefined) return createResultError(op, "The run execution target is not configured.")

  const parsedSnapshot = v.safeParse(runExecutionSnapshotSchema, {
    configuration: entry.configuration,
    configurationRevision: read.data.revision,
    target: parsedTarget.output,
  })
  if (!parsedSnapshot.success) return createResultError(op, "The run execution snapshot is invalid.")

  return createResult(runExecutionSnapshotDeepFreeze(parsedSnapshot.output))
}
