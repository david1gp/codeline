import * as v from "valibot"

const projectGitBranchNameForbiddenCharacters = new Set(["~", "^", ":", "?", "*", "[", "\\"])

function projectGitBranchNameIsValid(value: string): boolean {
  if (value === "@" || value === "HEAD" || value.startsWith("-")) return false
  if (value.startsWith("refs/")) return false
  if (value.startsWith("/") || value.endsWith("/") || value.includes("//")) return false
  if (value.endsWith(".") || value.includes("..") || value.includes("@{")) return false
  if (
    [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 32 || code === 127 || projectGitBranchNameForbiddenCharacters.has(character)
    })
  ) {
    return false
  }

  return value
    .split("/")
    .every(
      (component) =>
        component !== "" && !component.startsWith(".") && !component.endsWith(".") && !component.endsWith(".lock"),
    )
}

export const projectGitBranchNameSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(256),
  v.check(projectGitBranchNameIsValid),
)

export type ProjectGitBranchName = v.InferOutput<typeof projectGitBranchNameSchema>
