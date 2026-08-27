import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { runExecutionManifestSchema } from "../../run/schema/runExecutionManifestSchema.js"
import {
  type SessionExecutionResourceSummary,
  sessionExecutionResourceSummarySchema,
} from "./sessionExecutionResourceSummarySchema.js"

function sessionExecutionResourceSummaryPathIsSafe(value: string): boolean {
  if (value === ".") return true
  if (value.startsWith("/") || value.includes("\\")) return false
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
}

function sessionExecutionResourceSummaryProjectRootResolve(projectPath: string): string {
  return projectPath === "~" ? path.resolve(os.homedir()) : path.resolve(projectPath)
}

function sessionExecutionResourceSummaryInstructionPathResolve(
  projectRoot: string,
  source: "global" | "project",
  canonicalPath: string,
): string {
  if (source === "global") return "global/AGENTS.md"
  const relativePath = path.relative(projectRoot, path.resolve(canonicalPath)).split(path.sep).join("/")
  return sessionExecutionResourceSummaryPathIsSafe(relativePath) ? relativePath : "project"
}

function sessionExecutionResourceSummaryInstructionScopeResolve(source: "global" | "project", scope: string): string {
  if (source === "global") return "global"
  return sessionExecutionResourceSummaryPathIsSafe(scope) ? scope : "project"
}

export function sessionExecutionResourceSummaryCreate(input: {
  executionManifest: unknown
  projectPath: string
}): Result<SessionExecutionResourceSummary | null> {
  const op = "sessionExecutionResourceSummaryCreate"
  if (input.executionManifest === null || input.executionManifest === undefined) return createResult(null)

  const manifest = v.safeParse(runExecutionManifestSchema, input.executionManifest)
  if (!manifest.success) return createResultError(op, "The session execution manifest is invalid.")

  const projectRoot = sessionExecutionResourceSummaryProjectRootResolve(input.projectPath)
  const summary = {
    descriptionCatalog:
      manifest.output.skills.descriptionCatalog === undefined
        ? null
        : {
            characterCount: manifest.output.skills.descriptionCatalog.characterCount,
            estimatedTokens: manifest.output.skills.descriptionCatalog.estimatedTokens,
            estimatedTokensIsEstimate: true as const,
            skills: manifest.output.skills.descriptionCatalog.skills,
            version: 1 as const,
          },
    instructionSources: manifest.output.instructions.snapshots.map((snapshot) => ({
      digest: snapshot.digest,
      path: sessionExecutionResourceSummaryInstructionPathResolve(projectRoot, snapshot.source, snapshot.canonicalPath),
      precedence: snapshot.precedence,
      scope: sessionExecutionResourceSummaryInstructionScopeResolve(snapshot.source, snapshot.scope),
      size: snapshot.size,
      source: snapshot.source,
      validation: "valid" as const,
    })),
    presetName: manifest.output.skills.presetName ?? null,
    skills: manifest.output.skills.snapshots.map((skill) => ({
      bundleDigest: skill.bundleDigest,
      bundlePath: skill.bundlePath,
      description: skill.description,
      digest: skill.digest,
      name: skill.name,
      precedence: skill.precedence,
      resources: skill.resources.map(({ digest, path: resourcePath, size }) => ({
        digest,
        path: resourcePath,
        size,
      })),
      size: skill.size,
      source: skill.source,
    })),
    tools: manifest.output.tools,
    version: 1 as const,
  }
  const parsed = v.safeParse(sessionExecutionResourceSummarySchema, summary)
  if (!parsed.success) return createResultError(op, "The session execution resource summary is invalid.")
  return createResult(parsed.output)
}
