import * as v from "valibot"
import { projectGitStatusFileSchema } from "./projectGitStatusFileSchema.js"

const projectGitBranchSchema = v.nullable(v.pipe(v.string(), v.maxLength(256)))

export const projectGitStatusSchema = v.strictObject({
  branch: projectGitBranchSchema,
  files: v.pipe(v.array(projectGitStatusFileSchema), v.maxLength(1000)),
  isDirty: v.boolean(),
  isGitRepository: v.boolean(),
})

export type ProjectGitStatus = v.InferOutput<typeof projectGitStatusSchema>
