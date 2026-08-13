import { createResult, createResultError, type Result } from "@adaptive-ds/result"

export interface ProjectValidatedPath {
  normalizedPath: string
  segments: string[]
}

export function projectPathValidate(relativePath: string): Result<ProjectValidatedPath> {
  const op = "projectPathValidate"

  if (typeof relativePath !== "string") {
    return createResultError(op, "Path must be a string")
  }

  if (relativePath.includes("\0")) {
    return createResultError(op, "Path contains invalid NUL character")
  }

  if (relativePath.includes("\\")) {
    return createResultError(op, "Path contains backslash character")
  }

  if (/^[a-zA-Z]:/.test(relativePath)) {
    return createResultError(op, "Path contains Windows drive letter")
  }

  if (relativePath.startsWith("//")) {
    return createResultError(op, "Path contains UNC prefix")
  }

  if (relativePath.startsWith("/")) {
    return createResultError(op, "Path must be relative, absolute paths are rejected")
  }

  const trimmed = relativePath.trim()
  if (trimmed === "" || trimmed === ".") {
    return createResult({
      normalizedPath: "",
      segments: [],
    })
  }

  const segments = relativePath.split("/")
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i]
    if (segment === "") {
      return createResultError(op, "Path contains empty segment or trailing/leading slash")
    }
    if (segment === "." || segment === "..") {
      return createResultError(op, "Path contains invalid dot or dot-dot segment")
    }
  }

  return createResult({
    normalizedPath: segments.join("/"),
    segments,
  })
}
