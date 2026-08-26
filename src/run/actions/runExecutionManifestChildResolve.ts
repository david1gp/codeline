import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunExecutionManifest, runExecutionManifestSchema } from "../schema/runExecutionManifestSchema.js"

export function runExecutionManifestChildResolve(
  parentManifest: unknown,
  childAgentId: string,
): Result<RunExecutionManifest> {
  const op = "runExecutionManifestChildResolve"
  const parsed = v.safeParse(runExecutionManifestSchema, parentManifest)
  if (!parsed.success)
    return runResultCreateError(
      op,
      "The parent execution manifest is invalid or unavailable for child-agent selection.",
      runErrorCodes.childSnapshotInvalid,
    )

  const selectableSubagent = parsed.output.tools.selectableSubagents.find(({ agentId }) => agentId === childAgentId)
  if (selectableSubagent === undefined)
    return runResultCreateError(
      op,
      "The delegated child agent is not selectable in the persisted execution manifest.",
      runErrorCodes.childAgentNotSelectable,
    )

  const childManifest = {
    ...parsed.output,
    tools: {
      primary: selectableSubagent,
      selectableSubagents: [],
    },
  }
  const validated = v.safeParse(runExecutionManifestSchema, childManifest)
  if (!validated.success)
    return runResultCreateError(
      op,
      "The delegated child execution manifest is invalid.",
      runErrorCodes.childSnapshotInvalid,
    )
  return createResult(validated.output)
}
