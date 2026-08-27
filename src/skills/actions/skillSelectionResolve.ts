import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { SkillCatalog } from "../schema/skillCatalogSchema.js"
import { skillCatalogSchema } from "../schema/skillCatalogSchema.js"
import type { SkillPreset } from "../schema/skillPresetSchema.js"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"
import type { SkillSelectionOverride } from "../schema/skillSelectionOverrideSchema.js"
import { skillSelectionOverrideSchema } from "../schema/skillSelectionOverrideSchema.js"
import type { SkillSelection } from "../schema/skillSelectionSchema.js"
import { skillSelectionSchema } from "../schema/skillSelectionSchema.js"

export type SkillSelectionResolveInput = {
  catalog: unknown
  override?: unknown
  preset: unknown
}

function skillSelectionNameSort(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function skillSelectionFolderMatches(folderPath: string, bundlePath: string): boolean {
  if (folderPath === ".") return true
  return bundlePath === folderPath || bundlePath.startsWith(`${folderPath}/`)
}

function skillSelectionDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) skillSelectionDeepFreeze(child)
  return value
}

function skillSelectionOverrideDefaultCreate(): SkillSelectionOverride {
  return { disabledSkills: [], enabledSkills: [] }
}

function skillSelectionReferencesCollect(
  values: readonly string[],
  availableNames: ReadonlySet<string>,
  missingNames: Set<string>,
): void {
  for (const name of values) {
    if (!availableNames.has(name)) missingNames.add(name)
  }
}

function skillSelectionNamesSort(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(skillSelectionNameSort)
}

export function skillSelectionResolve(input: SkillSelectionResolveInput): Result<SkillSelection> {
  const op = "skillSelectionResolve"
  const parsedCatalog = v.safeParse(skillCatalogSchema, input.catalog)
  if (!parsedCatalog.success) return createResultError(op, "The skill catalog is invalid.")
  const parsedPreset = v.safeParse(skillPresetSchema, input.preset)
  if (!parsedPreset.success) return createResultError(op, "The skill preset is invalid.")
  const parsedOverride = v.safeParse(
    skillSelectionOverrideSchema,
    input.override === undefined ? skillSelectionOverrideDefaultCreate() : input.override,
  )
  if (!parsedOverride.success) return createResultError(op, "The skill selection override is invalid.")

  const catalog: SkillCatalog = parsedCatalog.output
  const preset: SkillPreset = parsedPreset.output
  const override: SkillSelectionOverride = {
    disabledSkills: [...parsedOverride.output.disabledSkills].sort(skillSelectionNameSort),
    enabledSkills: [...parsedOverride.output.enabledSkills].sort(skillSelectionNameSort),
  }
  const skillByName = new Map(catalog.skills.map((skill) => [skill.name, skill]))
  const availableNames = new Set(skillByName.keys())
  const selectedNames = new Set<string>()
  const missingNames = new Set<string>()
  const missingFolderPaths = new Set<string>()

  skillSelectionReferencesCollect(preset.includeSkills, availableNames, missingNames)
  skillSelectionReferencesCollect(override.enabledSkills, availableNames, missingNames)
  skillSelectionReferencesCollect(override.disabledSkills, availableNames, missingNames)
  skillSelectionReferencesCollect(preset.excludeSkills, availableNames, missingNames)

  for (const name of preset.includeSkills) {
    if (skillByName.has(name)) selectedNames.add(name)
  }
  for (const folderPath of preset.includeFolders) {
    const folderExists =
      folderPath === "."
        ? catalog.skills.some(({ bundlePath }) => bundlePath === ".") || catalog.groups.length > 0
        : catalog.groups.some(({ path }) => path === folderPath)
    if (!folderExists) missingFolderPaths.add(folderPath)
    for (const skill of catalog.skills) {
      if (skillSelectionFolderMatches(folderPath, skill.bundlePath)) selectedNames.add(skill.name)
    }
  }
  for (const name of override.enabledSkills) {
    if (skillByName.has(name)) selectedNames.add(name)
  }

  const excludedNames = new Set<string>()
  const excludedByName = new Set([...preset.excludeSkills, ...override.disabledSkills])
  for (const name of excludedByName) {
    if (skillByName.has(name)) excludedNames.add(name)
    selectedNames.delete(name)
  }

  const activeSkills = [...selectedNames].sort(skillSelectionNameSort).flatMap((name) => {
    const skill = skillByName.get(name)
    return skill === undefined ? [] : [structuredClone(skill)]
  })
  const selection = {
    activeSkills,
    excludedSkillNames: skillSelectionNamesSort(excludedNames),
    missingFolderPaths: [...missingFolderPaths].sort(skillSelectionNameSort),
    missingSkillNames: skillSelectionNamesSort(missingNames),
    presetName: preset.name,
    userOverride: structuredClone(override),
    version: 1 as const,
  }
  const validated = v.safeParse(skillSelectionSchema, selection)
  if (!validated.success) return createResultError(op, "The resolved skill selection is invalid.")
  return createResult(skillSelectionDeepFreeze(structuredClone(validated.output)))
}
