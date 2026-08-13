import * as v from "valibot"

const projectGitDiffSummaryCountSchema = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1_000_000_000))

export const projectGitDiffSummarySchema = v.strictObject({
  additions: projectGitDiffSummaryCountSchema,
  binaryFiles: projectGitDiffSummaryCountSchema,
  deletions: projectGitDiffSummaryCountSchema,
  filesChanged: projectGitDiffSummaryCountSchema,
  isGitRepository: v.boolean(),
})

export type ProjectGitDiffSummary = v.InferOutput<typeof projectGitDiffSummarySchema>
