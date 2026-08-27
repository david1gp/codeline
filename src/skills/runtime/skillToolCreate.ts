import { createResult, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { ToolDefinition } from "../../tools/runtime/toolDefinition.js"
import type { SkillSnapshot } from "../schema/skillSnapshotSchema.js"
import { skillSnapshotSchema } from "../schema/skillSnapshotSchema.js"
import { type SkillToolInput, skillToolInputSchema } from "../schema/skillToolInputSchema.js"
import { type SkillToolOutput, skillToolOutputSchema } from "../schema/skillToolOutputSchema.js"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"

const skillToolSnapshotsSchema = v.pipe(
  v.array(skillSnapshotSchema),
  v.maxLength(skillDiscoveryLimits.maximumBundles),
  v.check((snapshots) => new Set(snapshots.map(({ name }) => name)).size === snapshots.length),
)

export type SkillToolCreateOptions = {
  activeSkills: readonly SkillSnapshot[]
}

function skillToolDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) skillToolDeepFreeze(child)
  return value
}

function skillToolSnapshotsResolve(options: SkillToolCreateOptions): Result<readonly SkillSnapshot[]> {
  const parsed = v.safeParse(skillToolSnapshotsSchema, options.activeSkills)
  if (!parsed.success)
    return createResultErrorCode("skillToolCreate", "The active skill snapshots are invalid.", "tool.invalid-input")
  return createResult(skillToolDeepFreeze(structuredClone(parsed.output)))
}

function skillToolResourcePathResolve(input: SkillToolInput): string | undefined {
  return input.resourcePath ?? input.path
}

function skillToolOutputCreate(snapshot: SkillSnapshot, resourcePath: string | undefined): SkillToolOutput {
  const resource = resourcePath === undefined ? undefined : snapshot.resources.find(({ path }) => path === resourcePath)
  const resources =
    resource === undefined
      ? snapshot.resources.map(({ path }) => `  <file>${path}</file>`)
      : [`<skill_resource path="${resource.path}">`, resource.content, "</skill_resource>"]
  const output = [
    `<skill_content name="${snapshot.name}">`,
    `# Skill: ${snapshot.name}`,
    "",
    snapshot.body.trim(),
    "",
    `Base directory for this skill: ${snapshot.bundlePath}`,
    "Relative paths in this skill (e.g., scripts/, reference/) are relative to this bundle directory.",
    "Resources are immutable snapshotted files; request one by its bundle-relative path.",
    "",
    resource === undefined ? "<skill_files>" : "<skill_resources>",
    ...resources,
    resource === undefined ? "</skill_files>" : "</skill_resources>",
    "</skill_content>",
  ].join("\n")
  return { directory: snapshot.bundlePath, name: snapshot.name, output }
}

export function skillToolCreate(
  options: SkillToolCreateOptions,
): ToolDefinition<typeof skillToolInputSchema, typeof skillToolOutputSchema> {
  const snapshots = skillToolSnapshotsResolve(options)
  const snapshotsByName = new Map(snapshots.success ? snapshots.data.map((snapshot) => [snapshot.name, snapshot]) : [])
  return {
    execute: async (_context, input): Promise<Result<SkillToolOutput>> => {
      if (!snapshots.success)
        return createResultErrorCode(
          "skillToolCreate",
          "The active skill snapshots are invalid.",
          "tool.execution-failed",
        )
      const snapshot = snapshotsByName.get(input.name)
      if (snapshot === undefined)
        return createResultErrorCode(
          "skillToolCreate",
          `The ${input.name} skill is not active in the execution snapshot.`,
          "tool.unknown",
        )

      const resourcePath = skillToolResourcePathResolve(input)
      if (resourcePath !== undefined && !snapshot.resources.some(({ path }) => path === resourcePath))
        return createResultErrorCode(
          "skillToolCreate",
          `The ${resourcePath} resource is not snapshotted for the ${input.name} skill.`,
          "tool.unknown",
        )

      return createResult(skillToolOutputCreate(snapshot, resourcePath))
    },
    inputSchema: skillToolInputSchema,
    name: "skill",
    outputSchema: skillToolOutputSchema,
  }
}
