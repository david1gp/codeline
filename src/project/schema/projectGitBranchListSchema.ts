import * as v from "valibot"
import { projectGitBranchNameSchema } from "./projectGitBranchNameSchema.js"

export const projectGitBranchListSchema = v.strictObject({
  currentBranch: v.nullable(projectGitBranchNameSchema),
  otherBranches: v.pipe(v.array(projectGitBranchNameSchema), v.maxLength(1000)),
})

export type ProjectGitBranchList = v.InferOutput<typeof projectGitBranchListSchema>
