import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type AgentInstructionInspectionResponse,
  agentInstructionInspectionResponseSchema,
} from "../api/agentInstructionInspectionResponseSchema.js"
import type { AgentInstructionSnapshot } from "../schema/agentInstructionSnapshotSchema.js"
import { agentInstructionSnapshotSchema } from "../schema/agentInstructionSnapshotSchema.js"

type AgentInstructionInspectionResponseCreateInput = {
  projectId: string
  projectRoot: string
  snapshot: unknown
}

function agentInstructionInspectionPathIsWithin(rootDir: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDir, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function agentInstructionInspectionSafePathResolve(
  projectRoot: string,
  source: "global" | "project",
  candidatePath: string,
): string {
  if (source === "global") return "global/AGENTS.md"
  const resolvedPath = path.resolve(candidatePath)
  if (!agentInstructionInspectionPathIsWithin(projectRoot, resolvedPath)) return "project"
  const relativePath = path.relative(projectRoot, resolvedPath).split(path.sep).join("/")
  return relativePath || "."
}

function agentInstructionInspectionSafeScopeResolve(source: "global" | "project", scope: string): string {
  if (source === "global") return "global"
  if (scope === ".") return "."
  if (
    scope.startsWith("/") ||
    /^[A-Za-z]:/.test(scope) ||
    scope.includes("\\") ||
    scope.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  )
    return "project"
  return scope
}

function agentInstructionInspectionValidationMessageResolve(code: string): string {
  switch (code) {
    case "binary-content":
      return "AGENTS.md contains binary content."
    case "directory-entry-limit-exceeded":
      return "Instruction discovery exceeded its directory-entry budget."
    case "directory-unavailable":
      return "The instruction directory could not be read."
    case "file-too-large":
      return "AGENTS.md exceeds its file budget."
    case "file-unavailable":
      return "The AGENTS.md file could not be inspected."
    case "invalid-utf8":
      return "AGENTS.md is not valid UTF-8."
    case "not-regular-file":
      return "AGENTS.md must be a regular file."
    case "snapshot-limit-exceeded":
      return "Instruction discovery exceeded its snapshot budget."
    case "symbolic-link":
      return "AGENTS.md must not be a symbolic link."
    case "total-byte-budget-exceeded":
      return "Instruction discovery exceeded its total-byte budget."
    default:
      return "The AGENTS.md file failed validation."
  }
}

export function agentInstructionInspectionResponseCreate(
  input: AgentInstructionInspectionResponseCreateInput,
): Result<AgentInstructionInspectionResponse> {
  const op = "agentInstructionInspectionResponseCreate"
  const parsedSnapshot = v.safeParse(agentInstructionSnapshotSchema, input.snapshot)
  if (!parsedSnapshot.success) return createResultError(op, "The agent instruction snapshot is invalid.")
  if (!path.isAbsolute(input.projectRoot)) return createResultError(op, "The instruction project root is invalid.")

  const snapshot: AgentInstructionSnapshot = parsedSnapshot.output
  const response = {
    diagnostics: snapshot.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: agentInstructionInspectionValidationMessageResolve(diagnostic.code),
      path: agentInstructionInspectionSafePathResolve(input.projectRoot, diagnostic.source, diagnostic.path),
      precedence: diagnostic.precedence,
      scope: agentInstructionInspectionSafeScopeResolve(diagnostic.source, diagnostic.scope),
      source: diagnostic.source,
      validation: "invalid" as const,
    })),
    projectId: input.projectId,
    snapshots: snapshot.snapshots.map((entry) => ({
      canonicalPath: entry.canonicalPath,
      content: entry.content,
      digest: entry.digest,
      path: agentInstructionInspectionSafePathResolve(input.projectRoot, entry.source, entry.canonicalPath),
      precedence: entry.precedence,
      scope: agentInstructionInspectionSafeScopeResolve(entry.source, entry.scope),
      size: entry.size,
      source: entry.source,
      validation: "valid" as const,
    })),
    version: 1 as const,
  }
  const parsedResponse = v.safeParse(agentInstructionInspectionResponseSchema, response)
  if (!parsedResponse.success) return createResultError(op, "The agent instruction inspection response is invalid.")
  return createResult(parsedResponse.output)
}
