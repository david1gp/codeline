import * as v from "valibot"

const resourceNameSchema = v.pipe(v.string(), v.trim(), v.minLength(1))
const resourceNamesSchema = v.pipe(
  v.array(resourceNameSchema),
  v.check((names) => new Set(names).size === names.length),
)
const setSchema = v.strictObject({
  id: resourceNameSchema,
  name: resourceNameSchema,
  resourceNames: resourceNamesSchema,
  excludedResourceNames: v.optional(resourceNamesSchema),
  includeNewResources: v.boolean(),
  includeAllResources: v.boolean(),
})
const categorySchema = v.strictObject({
  defaultSetId: resourceNameSchema,
  sets: v.pipe(
    v.array(setSchema),
    v.check((sets) => new Set(sets.map(({ id }) => id)).size === sets.length),
    v.check((sets) => new Set(sets.map(({ name }) => name)).size === sets.length),
    v.minLength(1),
  ),
})

export const globalAgentPresetDocumentSchema = v.pipe(
  v.strictObject({
    presets: v.pipe(
      v.array(
        v.strictObject({
          id: resourceNameSchema,
          name: resourceNameSchema,
          skillSetIds: resourceNamesSchema,
          commandSetIds: resourceNamesSchema,
          toolSetIds: resourceNamesSchema,
          subagentSetIds: resourceNamesSchema,
          subagentNames: resourceNamesSchema,
          executionAgentId: resourceNameSchema,
          modelId: resourceNameSchema,
        }),
      ),
      v.check((presets) => new Set(presets.map(({ id }) => id)).size === presets.length),
    ),
    categories: v.strictObject({
      skills: categorySchema,
      commands: categorySchema,
      tools: categorySchema,
      subagents: categorySchema,
    }),
    version: v.literal(1),
  }),
  v.check(
    (document) =>
      Object.values(document.categories).every((category) =>
        category.sets.some(({ id }) => id === category.defaultSetId),
      ),
    "Each resource category must reference an existing default set.",
  ),
  v.check(
    (document) =>
      document.presets.every(
        (preset) =>
          preset.skillSetIds.every((id) => document.categories.skills.sets.some((set) => set.id === id)) &&
          preset.commandSetIds.every((id) => document.categories.commands.sets.some((set) => set.id === id)) &&
          preset.toolSetIds.every((id) => document.categories.tools.sets.some((set) => set.id === id)) &&
          preset.subagentSetIds.every((id) => document.categories.subagents.sets.some((set) => set.id === id)),
      ),
    "Preset set references must exist in their resource category.",
  ),
)

export type GlobalAgentPresetDocument = v.InferOutput<typeof globalAgentPresetDocumentSchema>
