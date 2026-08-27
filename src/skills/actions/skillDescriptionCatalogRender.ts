import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { SkillDescriptionCatalog } from "../schema/skillDescriptionCatalogSchema.js"
import { skillDescriptionCatalogSchema } from "../schema/skillDescriptionCatalogSchema.js"
import { skillSnapshotSchema } from "../schema/skillSnapshotSchema.js"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"

type SkillDescriptionCatalogInput = unknown

function skillDescriptionCatalogSkillSort(
  left: v.InferOutput<typeof skillSnapshotSchema>,
  right: v.InferOutput<typeof skillSnapshotSchema>,
): number {
  if (left.name < right.name) return -1
  if (left.name > right.name) return 1
  if (left.bundlePath < right.bundlePath) return -1
  if (left.bundlePath > right.bundlePath) return 1
  return 0
}

function skillDescriptionCatalogDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) skillDescriptionCatalogDeepFreeze(child)
  return value
}

function skillDescriptionCatalogSnapshotsResolve(input: SkillDescriptionCatalogInput): unknown {
  if (Array.isArray(input)) return input
  if (typeof input !== "object" || input === null) return undefined
  if ("activeSkills" in input) return input.activeSkills
  if ("snapshots" in input) return input.snapshots
  return undefined
}

export function skillDescriptionCatalogRender(input: SkillDescriptionCatalogInput): Result<SkillDescriptionCatalog> {
  const op = "skillDescriptionCatalogRender"
  const snapshots = skillDescriptionCatalogSnapshotsResolve(input)
  const parsed = v.safeParse(
    v.pipe(v.array(skillSnapshotSchema), v.maxLength(skillDiscoveryLimits.maximumBundles)),
    snapshots,
  )
  if (!parsed.success) return createResultError(op, "The active skill snapshots are invalid.")

  const skills = [...parsed.output].sort(skillDescriptionCatalogSkillSort).map(({ bundlePath, description, name }) => ({
    bundlePath,
    description,
    name,
  }))
  const content =
    skills.length === 0
      ? ""
      : [
          "Available skills:",
          ...skills.flatMap(({ bundlePath, description, name }) => [
            `- ${name}: ${description}`,
            `  location: ${bundlePath}`,
          ]),
        ].join("\n")
  const catalog = {
    characterCount: content.length,
    content,
    estimatedTokens: Math.ceil(content.length / 4),
    estimatedTokensIsEstimate: true as const,
    skills,
    version: 1 as const,
  }
  const validated = v.safeParse(skillDescriptionCatalogSchema, catalog)
  if (!validated.success) return createResultError(op, "The skill description catalog is invalid.")
  return createResult(skillDescriptionCatalogDeepFreeze(structuredClone(validated.output)))
}
