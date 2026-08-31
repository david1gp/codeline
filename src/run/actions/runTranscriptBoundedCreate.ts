import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { executionToolPayloadBound } from "../../stream/actions/executionToolPayloadBound.js"
import type { RunTranscript } from "../api/runTranscriptSchema.js"
import { runTranscriptSchema } from "../api/runTranscriptSchema.js"
import type { executionTranscriptProject } from "./executionTranscriptProject.js"

type ProjectedTranscript = ReturnType<typeof executionTranscriptProject>

function runTranscriptContentBound(content: string): { content: string; truncated: boolean } {
  return executionToolPayloadBound(content, "text")
}

function runTranscriptActivityBound(activity: ProjectedTranscript["activities"][number]) {
  if (activity.kind === "written_file") return activity
  if (activity.kind === "thinking" && activity.phase !== "delta") return activity
  if (activity.kind === "thinking") {
    const bounded = runTranscriptContentBound(activity.content)
    return { ...activity, content: bounded.content }
  }
  if (activity.phase === "started") return activity
  if (activity.phase === "delta") {
    const bounded = runTranscriptContentBound(activity.content)
    return { ...activity, content: bounded.content }
  }
  const bounded = runTranscriptContentBound(activity.content)
  return { ...activity, content: bounded.content, truncated: activity.truncated || bounded.truncated }
}

export function runTranscriptBoundedCreate(input: ProjectedTranscript): Result<RunTranscript> {
  const boundedAssistantText = runTranscriptContentBound(input.assistantText)
  const parsed = v.safeParse(runTranscriptSchema, {
    activities: input.activities.map(runTranscriptActivityBound),
    assistantText: boundedAssistantText.content,
    ...(input.authoritativeAttemptOrdinal === undefined
      ? {}
      : { authoritativeAttemptOrdinal: input.authoritativeAttemptOrdinal }),
    attempts: input.attempts,
    cancellation: input.cancellation,
    failure: input.failure,
    invariantViolations: input.invariantViolations,
    terminalOutcome: input.terminalOutcome,
  })
  if (!parsed.success) return createResultError("runTranscriptBoundedCreate", "The bounded run transcript is invalid.")
  return createResult(parsed.output)
}
