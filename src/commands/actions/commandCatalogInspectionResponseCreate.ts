import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type CommandCatalogInspectionResponse,
  commandCatalogInspectionResponseSchema,
} from "../api/commandCatalogInspectionResponseSchema.js"
import { commandCatalogSchema } from "../schema/commandCatalogSchema.js"

function commandInspectionPathIsWithin(rootDir: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDir, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function commandInspectionPathResolve(
  projectRoot: string,
  source: "global" | "project",
  candidatePath: string,
): string {
  if (source === "global") return "global/commands"
  const resolved = path.resolve(
    path.isAbsolute(candidatePath) ? candidatePath : path.join(projectRoot, ".agents", "commands", candidatePath),
  )
  if (!commandInspectionPathIsWithin(projectRoot, resolved)) return "project"
  return path.relative(projectRoot, resolved).split(path.sep).join("/") || "."
}

function commandInspectionFilePathResolve(source: "global" | "project", candidatePath: string): string {
  return source === "global" ? `global/commands/${candidatePath}` : `.agents/commands/${candidatePath}`
}

export function commandCatalogInspectionResponseCreate(input: {
  catalog: unknown
  projectId: string
  projectRoot: string
}): Result<CommandCatalogInspectionResponse> {
  const op = "commandCatalogInspectionResponseCreate"
  const catalog = v.safeParse(commandCatalogSchema, input.catalog)
  if (!catalog.success || !path.isAbsolute(input.projectRoot))
    return createResultError(op, "The command catalog inspection input is invalid.")

  const commands = catalog.output.commands.map((command) => ({
    ...(command.agent === undefined ? {} : { agent: command.agent }),
    ...(command.description === undefined ? {} : { description: command.description }),
    name: command.name,
    path: commandInspectionFilePathResolve(command.source, command.relativePath),
    precedence: command.precedence,
    size: command.size,
    source: command.source,
    ...(command.subtask === undefined ? {} : { subtask: command.subtask }),
    template: command.body,
    templateDigest: command.templateDigest,
    validation: "valid" as const,
    ...(command.model === undefined ? {} : { model: command.model }),
  }))
  const response = v.safeParse(commandCatalogInspectionResponseSchema, {
    collisions: catalog.output.collisions.map(({ candidates, name, winner }) => ({
      candidates: candidates.map(({ digest, precedence, relativePath, source, templateDigest }) => ({
        digest,
        path: commandInspectionFilePathResolve(source, relativePath),
        precedence,
        source,
        templateDigest,
      })),
      name,
      winner: {
        digest: winner.digest,
        path: commandInspectionFilePathResolve(winner.source, winner.relativePath),
        precedence: winner.precedence,
        source: winner.source,
        templateDigest: winner.templateDigest,
      },
    })),
    commands,
    diagnostics: catalog.output.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      path: commandInspectionPathResolve(input.projectRoot, diagnostic.source, diagnostic.path),
      precedence: diagnostic.precedence,
      relativePath: commandInspectionPathResolve(input.projectRoot, diagnostic.source, diagnostic.relativePath),
      source: diagnostic.source,
      validation: "invalid" as const,
    })),
    digest: catalog.output.digest,
    projectId: input.projectId,
    roots: catalog.output.roots.map(({ canonicalPath, precedence, source }) => ({
      path:
        source === "global"
          ? "global/commands"
          : commandInspectionPathResolve(input.projectRoot, source, canonicalPath),
      precedence,
      source,
    })),
    version: 1 as const,
  })
  if (!response.success) return createResultError(op, "The command catalog inspection response is invalid.")
  return createResult(response.output)
}
