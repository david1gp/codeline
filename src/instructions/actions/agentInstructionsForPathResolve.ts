import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { AgentInstructionSnapshotEntry } from "../schema/agentInstructionSnapshotEntrySchema.js"
import { agentInstructionsContentRender } from "./agentInstructionsContentRender.js"
import { agentInstructionsSnapshotResolve } from "./agentInstructionsSnapshotResolve.js"

export type AgentInstructionsForPath = {
  baseline: string
  overlay: string
  overlays: AgentInstructionSnapshotEntry[]
  rendered: string
}

type AgentInstructionsForPathInput = {
  projectRoot: string
  snapshot: unknown
  workingDirectory: string
}

function agentInstructionsPathIsWithin(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function agentInstructionsScopePathResolve(projectRoot: string, scope: string): string | null {
  if (scope === ".") return projectRoot
  if (scope.includes("\\") || path.isAbsolute(scope)) return null

  const segments = scope.split("/")
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return null

  const scopePath = path.resolve(projectRoot, ...segments)
  return agentInstructionsPathIsWithin(projectRoot, scopePath) ? scopePath : null
}

function agentInstructionsSnapshotEntryDirectoryResolve(
  projectRoot: string,
  entry: AgentInstructionSnapshotEntry,
): string | null {
  if (entry.precedence < 1) return null
  const scopePath = agentInstructionsScopePathResolve(projectRoot, entry.scope)
  if (scopePath === null) return null
  if (path.resolve(entry.canonicalPath) !== path.join(scopePath, "AGENTS.md")) return null
  return scopePath
}

function agentInstructionsPathWorkingDirectoryResolve(projectRoot: string, workingDirectory: string): string | null {
  if (typeof workingDirectory !== "string" || workingDirectory.length === 0) return null
  const resolved = path.isAbsolute(workingDirectory)
    ? path.resolve(workingDirectory)
    : path.resolve(projectRoot, workingDirectory)
  return agentInstructionsPathIsWithin(projectRoot, resolved) ? resolved : null
}

function agentInstructionsForPathDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value

  Object.freeze(value)
  for (const child of Object.values(value)) agentInstructionsForPathDeepFreeze(child)
  return value
}

export function agentInstructionsForPathResolve(
  input: AgentInstructionsForPathInput,
): Result<AgentInstructionsForPath> {
  const op = "agentInstructionsForPathResolve"
  if (input === null || typeof input !== "object")
    return createResultError(op, "The instruction path resolution input is invalid.")
  if (typeof input.projectRoot !== "string" || !path.isAbsolute(input.projectRoot))
    return createResultError(op, "The instruction project root is invalid.")

  const projectRoot = path.resolve(input.projectRoot)
  const workingDirectory = agentInstructionsPathWorkingDirectoryResolve(projectRoot, input.workingDirectory)
  if (workingDirectory === null)
    return createResultError(op, "The instruction working directory must be a project descendant.")

  const snapshot = agentInstructionsSnapshotResolve(input.snapshot)
  if (!snapshot.success) return snapshot

  const baselineEntries: AgentInstructionSnapshotEntry[] = []
  const overlays: AgentInstructionSnapshotEntry[] = []
  for (const entry of snapshot.data.snapshots) {
    if (entry.source === "global") {
      if (entry.scope !== "global" || entry.precedence !== 0)
        return createResultError(op, "The agent instruction snapshot contains an invalid global entry.")
      baselineEntries.push(entry)
      continue
    }
    const scopePath = agentInstructionsSnapshotEntryDirectoryResolve(projectRoot, entry)
    if (scopePath === null)
      return createResultError(op, "The agent instruction snapshot contains an invalid scoped path.")
    if (entry.scope === ".") {
      baselineEntries.push(entry)
      continue
    }
    if (agentInstructionsPathIsWithin(scopePath, workingDirectory)) overlays.push(entry)
  }

  const baseline = agentInstructionsContentRender(baselineEntries)
  const overlay = agentInstructionsContentRender(overlays)
  const rendered = agentInstructionsContentRender([...baselineEntries, ...overlays])
  return createResult(agentInstructionsForPathDeepFreeze(structuredClone({ baseline, overlay, overlays, rendered })))
}
