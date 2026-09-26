import type { GlobalAgentPresetDocument } from "./globalAgentPresetDocumentSchema.js"

export type GlobalAgentPresetResourceCategory = keyof GlobalAgentPresetDocument["categories"]

export function globalAgentPresetResourcesResolve(
  document: GlobalAgentPresetDocument,
  category: GlobalAgentPresetResourceCategory,
  setIds: readonly string[],
  discoveredNames: readonly string[] = [],
): string[] {
  const sets = document.categories[category].sets
  const selected = new Set(setIds)
  const names: string[] = []
  for (const set of sets) {
    if (!selected.has(set.id)) continue
    const excluded = new Set(set.excludedResourceNames ?? [])
    names.push(...set.resourceNames.filter((name) => !excluded.has(name)))
    if (set.includeAllResources || set.includeNewResources || (category === "commands" && set.id === document.categories.commands.defaultSetId)) {
      names.push(...discoveredNames.filter((name) => !excluded.has(name)))
    }
  }
  return [...new Set(names)]
}

export function globalAgentPresetResourcesResolveForPreset(
  document: GlobalAgentPresetDocument,
  category: GlobalAgentPresetResourceCategory,
  presetId: string,
  discoveredNames: readonly string[] = [],
): string[] | undefined {
  const preset = document.presets.find(({ id }) => id === presetId)
  if (preset === undefined) return undefined
  const setIds = category === "skills"
    ? preset.skillSetIds
    : category === "commands"
      ? preset.commandSetIds
      : category === "tools"
        ? preset.toolSetIds
        : preset.subagentSetIds
  const names = globalAgentPresetResourcesResolve(document, category, setIds, discoveredNames)
  return category === "subagents" ? [...new Set([...names, ...preset.subagentNames])] : names
}
