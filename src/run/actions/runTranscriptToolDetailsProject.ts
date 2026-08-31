import { executionToolPayloadBound } from "../../stream/actions/executionToolPayloadBound.js"
import type { RunToolDetail } from "../api/runToolDetailSchema.js"
import { runToolDetailIdCreate } from "./runToolDetailIdCreate.js"
import type { executionTranscriptProject } from "./executionTranscriptProject.js"

type RunTranscript = ReturnType<typeof executionTranscriptProject>

function runTranscriptToolContentBound(content: string): { content: string; truncated: boolean } {
  return executionToolPayloadBound(content, "text")
}

export function runTranscriptToolDetailsProject(runId: string, transcript: RunTranscript): Array<RunToolDetail> {
  const tools = new Map<string, RunToolDetail>()
  for (const activity of transcript.activities) {
    if (activity.kind !== "tool" || activity.toolCallId === undefined) continue
    const existing = tools.get(activity.toolCallId)
    const base =
      existing ??
      ({
        detailId: runToolDetailIdCreate(runId, activity.toolCallId),
        sequence: activity.sequence ?? 1,
        toolCallId: activity.toolCallId,
      } satisfies RunToolDetail)
    const sequence = activity.sequence === undefined ? base.sequence : Math.min(base.sequence, activity.sequence)
    const next = { ...base, sequence }
    if (activity.name !== undefined) next.toolName = activity.name
    if (activity.phase === "output") {
      const bounded = runTranscriptToolContentBound(activity.content)
      next.output = bounded.content
      next.outputTruncated = activity.truncated || bounded.truncated
    }
    if (activity.phase === "result") {
      const bounded = runTranscriptToolContentBound(activity.content)
      next.outcome = activity.outcome
      next.result = bounded.content
      next.resultTruncated = activity.truncated || bounded.truncated
      if (activity.workingDirectory !== undefined) next.workingDirectory = activity.workingDirectory
    }
    tools.set(activity.toolCallId, next)
  }
  return [...tools.values()].sort(
    (left, right) => left.sequence - right.sequence || left.detailId.localeCompare(right.detailId),
  )
}
