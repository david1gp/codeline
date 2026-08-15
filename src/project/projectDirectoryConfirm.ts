import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { projectPathReferenceResolve } from "./projectPathReferenceResolve.js"

type ProjectDirectoryConfirmation = {
  path: string
  label: string
}

export async function projectDirectoryConfirm(
  directoryPath: string,
  rootDirs: readonly string[],
): Promise<Result<ProjectDirectoryConfirmation>> {
  const op = "projectDirectoryConfirm"
  if (typeof directoryPath !== "string" || directoryPath === "~") {
    return createResultError(op, "The project directory is invalid.")
  }

  const reference = await projectPathReferenceResolve(directoryPath, rootDirs)
  if (!reference.success) return createResultError(op, "The project directory is invalid.")
  return createResult({ path: reference.data, label: path.basename(reference.data) || reference.data })
}
