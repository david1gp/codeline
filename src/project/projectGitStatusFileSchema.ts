import * as v from "valibot"
import { projectPathValidate } from "./projectPathValidate.js"

const projectGitStatusPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4096),
  v.check((value) => {
    if (
      [...value].some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })
    ) {
      return false
    }
    const parsed = projectPathValidate(value)
    return parsed.success && parsed.data.normalizedPath === value
  }),
)

export const projectGitStatusFileSchema = v.strictObject({
  originalPath: v.optional(projectGitStatusPathSchema),
  path: projectGitStatusPathSchema,
  status: v.picklist(["modified", "added", "deleted", "renamed", "copied", "untracked", "conflict"]),
})

export type ProjectGitStatusFile = v.InferOutput<typeof projectGitStatusFileSchema>
