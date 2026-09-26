import type { GlobalAgentPresetDocument } from "./globalAgentPresetDocumentSchema.js"

type SetEntry = GlobalAgentPresetDocument["categories"]["skills"]["sets"][number]

export function globalAgentPresetSetMembershipChange(set: SetEntry, resource: string, enabled: boolean): SetEntry {
  const excludedResourceNames = set.excludedResourceNames ?? []
  if (enabled) return {
    ...set,
    resourceNames: set.includeAllResources || set.includeNewResources || set.resourceNames.includes(resource)
      ? set.resourceNames : [...set.resourceNames, resource],
    ...(set.excludedResourceNames ? { excludedResourceNames: excludedResourceNames.filter((name) => name !== resource) } : {}),
  }
  return {
    ...set,
    resourceNames: set.resourceNames.filter((name) => name !== resource),
    excludedResourceNames: excludedResourceNames.includes(resource) ? excludedResourceNames : [...excludedResourceNames, resource],
  }
}
