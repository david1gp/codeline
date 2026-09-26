import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { CompactionSummaryPromptInput } from "./compactionSummaryPromptInput.js"

export function compactionSummaryPromptCreate(input: CompactionSummaryPromptInput): Result<string> {
  const op = "compactionSummaryPromptCreate"
  if (input.transcript.trim().length === 0)
    return createResultError(op, "A transcript is required to create a summary prompt.")
  const previousSummary = input.previousSummary?.trim() || "(none)"
  const criticalContext = input.criticalContext?.trim() || "(none)"
  return createResult(`You are maintaining a durable, rolling summary of a coding-agent conversation.

Update the previous summary from the transcript. Preserve facts; do not invent, silently generalize, or omit actionable detail. The summary must retain:

## Goals
- User goals and requested outcomes.

## Constraints
- Technical, product, repository, safety, and process constraints.

## Decisions
- Decisions made and the reasoning or alternatives that matter.

## Progress
- Completed work and remaining work.

## Errors
- Failures, warnings, unresolved issues, and attempted remedies.

## Exact paths and commands
- Preserve file paths, URLs, identifiers, and commands exactly as written.

## File reads
- List files inspected and the relevant findings.

## Files modified
- List files changed and what changed in each.

## Next step
- State the single most useful next action, including its exact command or path when known.

## Critical context
- Preserve details required to continue safely, including tool-call state and important environment facts.

Previous summary:
<previous-summary>
${previousSummary}
</previous-summary>

Critical context supplied by the caller:
<critical-context>
${criticalContext}
</critical-context>

Transcript to summarize:
<transcript>
${input.transcript}
</transcript>

Return only the updated structured summary. Keep exact paths and commands in code formatting where useful, and explicitly write "none known" when a section has no facts.`)
}
