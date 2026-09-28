import { isAbsolute, normalize } from "node:path"
import { fileURLToPath } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"

export function databaseFilePathResolve(input: string): Result<string> {
  const op = "databaseFilePathResolve"
  if (input.length === 0 || input.includes("\0"))
    return createResultError(op, "An absolute SQLite path or file URL is required.")
  if (isAbsolute(input)) return createResult(normalize(input))
  // URL() alone would turn file:relative into an absolute, cwd-independent but unintended path.
  if (!input.startsWith("file:///")) return createResultError(op, "An absolute SQLite path or file URL is required.")

  try {
    const url = new URL(input)
    if (url.host !== "" || url.search !== "" || url.hash !== "")
      return createResultError(op, "An absolute SQLite path or file URL is required.")
    // Bun's fileURLToPath tolerates malformed escapes that Node rejects.
    const decodedPath = decodeURIComponent(url.pathname)
    if (decodedPath.includes("\0") || /%2f/i.test(url.pathname))
      return createResultError(op, "The SQLite file path is invalid.")
    const filePath = fileURLToPath(url)
    if (filePath.includes("\0")) return createResultError(op, "The SQLite file path is invalid.")
    return createResult(filePath)
  } catch (_error) {
    return createResultError(op, "The SQLite file URL is invalid.")
  }
}
