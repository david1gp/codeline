import type { GlobalAgentPresetDocument } from "./globalAgentPresetDocumentSchema.js"
import type { GlobalAgentPresetResourceCategory } from "./globalAgentPresetResourcesResolve.js"
import { globalAgentPresetSetMembershipChange } from "./globalAgentPresetSetMembershipChange.js"

export function globalAgentPresetDefaultMembershipAdd(
  document: GlobalAgentPresetDocument,
  category: GlobalAgentPresetResourceCategory,
  resourceName: string,
): GlobalAgentPresetDocument {
  const target = document.categories[category]
  return {
    ...document,
    categories: {
      ...document.categories,
      [category]: {
        ...target,
        sets: target.sets.map((set) =>
          set.id === target.defaultSetId ? globalAgentPresetSetMembershipChange(set, resourceName, true) : set,
        ),
      },
    },
  }
}
