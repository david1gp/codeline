import * as v from "valibot"
import { projectGitStatusFileSchema } from "./projectGitStatusFileSchema.js"

const projectGitBranchSchema = v.nullable(
  v.pipe(
    v.string(),
    v.maxLength(256),
    v.check((value) =>
      [...value].every((character) => {
        const code = character.charCodeAt(0)
        return code >= 32 && code !== 127
      }),
    ),
  ),
)

export const projectGitStatusSchema = v.strictObject({
  branch: projectGitBranchSchema,
  files: v.pipe(v.array(projectGitStatusFileSchema), v.maxLength(1000)),
  isDirty: v.boolean(),
  isGitRepository: v.boolean(),
})

export type ProjectGitStatus = v.InferOutput<typeof projectGitStatusSchema>
