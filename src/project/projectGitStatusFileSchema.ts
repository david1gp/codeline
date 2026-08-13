import * as v from "valibot"

const projectGitStatusPathSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(4096))

export const projectGitStatusFileSchema = v.strictObject({
  originalPath: v.optional(projectGitStatusPathSchema),
  path: projectGitStatusPathSchema,
  status: v.picklist(["modified", "added", "deleted", "renamed", "copied", "untracked", "conflict"]),
})

export type ProjectGitStatusFile = v.InferOutput<typeof projectGitStatusFileSchema>
