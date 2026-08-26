import { createResult, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { sessionExecutionSelectionSchema } from "../../session/schema/sessionExecutionSelectionSchema.js"
import type { ToolName } from "../../tools/schema/toolNameSchema.js"
import { runErrorCodes } from "../errors/runErrorCodes.js"
import { runResultCreateError } from "../errors/runResultCreateError.js"
import { type RunExecutionManifest, runExecutionManifestSchema } from "../schema/runExecutionManifestSchema.js"

function runExecutionManifestSelectionToolsResolve(bash: boolean, webfetch: boolean): ToolName[] {
  return [...(bash ? ["bash" as const] : []), ...(webfetch ? ["webfetch" as const] : []), "skill", "delegate_task"]
}

export function runExecutionManifestSelectionResolve(input: {
  primaryAgentId: string
  selection: unknown
}): Result<RunExecutionManifest> {
  const op = "runExecutionManifestSelectionResolve"
  const parsed = v.safeParse(sessionExecutionSelectionSchema, input.selection)
  if (!parsed.success)
    return runResultCreateError(
      op,
      "The session execution selection is invalid.",
      runErrorCodes.executionSnapshotInvalid,
    )
  if (parsed.output.tools.primary.agentId !== input.primaryAgentId)
    return runResultCreateError(
      op,
      "The session execution selection primary agent does not match the run target.",
      runErrorCodes.executionSnapshotInvalid,
    )

  const manifest = {
    commandCatalog: { digest: null, version: 1 as const },
    instructions: { snapshots: [], version: 1 as const },
    skills: { snapshots: [], version: 1 as const },
    tools: {
      primary: {
        agentId: parsed.output.tools.primary.agentId,
        tools: runExecutionManifestSelectionToolsResolve(
          parsed.output.tools.primary.tools.bash,
          parsed.output.tools.primary.tools.webfetch,
        ),
      },
      selectableSubagents: parsed.output.tools.selectableSubagents.map(({ agentId, tools }) => ({
        agentId,
        tools: runExecutionManifestSelectionToolsResolve(tools.bash, tools.webfetch),
      })),
    },
    version: 1 as const,
  }
  const validated = v.safeParse(runExecutionManifestSchema, manifest)
  if (!validated.success)
    return runResultCreateError(op, "The run execution manifest is invalid.", runErrorCodes.executionSnapshotInvalid)
  return createResult(validated.output)
}
