import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import {
  type SkillCatalogInspectionResponse,
  skillCatalogInspectionResponseSchema,
} from "../api/skillCatalogInspectionResponseSchema.js"
import type { SkillCatalog } from "../schema/skillCatalogSchema.js"
import { skillCatalogSchema } from "../schema/skillCatalogSchema.js"
import { skillInspectionSnapshotCreate } from "./skillInspectionSnapshotCreate.js"

function skillInspectionPathIsWithin(rootDir: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDir, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function skillInspectionPathResolve(projectRoot: string, source: "global" | "project", candidatePath: string): string {
  if (source === "global") return "global/skills"
  if (!path.isAbsolute(candidatePath))
    return `.agents/skills/${candidatePath === "." ? "" : `${candidatePath}/`}`.replace(/\/$/, "")
  const resolved = path.resolve(candidatePath)
  if (!skillInspectionPathIsWithin(projectRoot, resolved)) return "project"
  return path.relative(projectRoot, resolved).split(path.sep).join("/") || "."
}

function skillInspectionBundlePathResolve(source: "global" | "project", bundlePath: string): string {
  return source === "global"
    ? `global/skills/${bundlePath === "." ? "" : `${bundlePath}/`}`.replace(/\/$/, "")
    : `.agents/skills/${bundlePath === "." ? "" : `${bundlePath}/`}`.replace(/\/$/, "")
}

function skillInspectionSnapshotPathRewrite(snapshot: SkillCatalog["bundles"][number]): unknown {
  return {
    ...snapshot,
    bundlePath: skillInspectionBundlePathResolve(snapshot.source, snapshot.bundlePath),
  }
}

export function skillCatalogInspectionResponseCreate(input: {
  catalog: unknown
  projectId: string
  projectRoot: string
}): Result<SkillCatalogInspectionResponse> {
  const op = "skillCatalogInspectionResponseCreate"
  const catalog = v.safeParse(skillCatalogSchema, input.catalog)
  if (!catalog.success || !path.isAbsolute(input.projectRoot))
    return createResultError(op, "The skill catalog inspection input is invalid.")

  const snapshotCreate = (snapshot: SkillCatalog["bundles"][number]) =>
    skillInspectionSnapshotCreate(skillInspectionSnapshotPathRewrite(snapshot))
  const bundles = catalog.output.bundles.map(snapshotCreate)
  const skills = catalog.output.skills.map(snapshotCreate)
  if (bundles.some((result) => !result.success) || skills.some((result) => !result.success))
    return createResultError(op, "The skill catalog inspection snapshots are invalid.")

  const response = v.safeParse(skillCatalogInspectionResponseSchema, {
    bundles: bundles.map((result) => (result.success ? result.data : undefined)),
    collisions: catalog.output.collisions.map(({ candidates, name, winner }) => ({
      candidates: candidates.map(({ bundlePath, digest, precedence, source }) => ({
        bundlePath: skillInspectionBundlePathResolve(source, bundlePath),
        digest,
        precedence,
        source,
      })),
      name,
      winner: {
        bundlePath: skillInspectionBundlePathResolve(winner.source, winner.bundlePath),
        digest: winner.digest,
        precedence: winner.precedence,
        source: winner.source,
      },
    })),
    diagnostics: catalog.output.diagnostics.map((diagnostic) => ({
      ...(diagnostic.bundlePath === undefined
        ? {}
        : { bundlePath: skillInspectionBundlePathResolve(diagnostic.source, diagnostic.bundlePath) }),
      code: diagnostic.code,
      message: diagnostic.message,
      path: skillInspectionPathResolve(input.projectRoot, diagnostic.source, diagnostic.path),
      precedence: diagnostic.precedence,
      relativePath: skillInspectionPathResolve(input.projectRoot, diagnostic.source, diagnostic.relativePath),
      source: diagnostic.source,
      validation: "invalid" as const,
    })),
    digest: catalog.output.digest,
    groups: catalog.output.groups.map(({ path: groupPath, precedence, source }) => ({
      path: skillInspectionBundlePathResolve(source, groupPath),
      precedence,
      source,
    })),
    projectId: input.projectId,
    roots: catalog.output.roots.map(({ canonicalPath, precedence, source }) => ({
      path:
        source === "global" ? "global/skills" : skillInspectionPathResolve(input.projectRoot, source, canonicalPath),
      precedence,
      source,
    })),
    skills: skills.map((result) => (result.success ? result.data : undefined)),
    version: 1 as const,
  })
  if (!response.success) return createResultError(op, "The skill catalog inspection response is invalid.")
  return createResult(response.output)
}
