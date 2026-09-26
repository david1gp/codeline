import type { GlobalAgentPresetDocument } from "./globalAgentPresetDocumentSchema.js"

export function globalAgentPresetDocumentDefaults(): GlobalAgentPresetDocument {
  const category = (key: string, includeAllResources = false) => ({
    defaultSetId: `default-${key}`,
    sets: [
      {
        id: `default-${key}`,
        name: "Default",
        resourceNames: [],
        includeNewResources: true,
        includeAllResources,
      },
    ],
  })
  return {
    categories: {
      skills: category("skills"),
      commands: category("commands", true),
      tools: {
        defaultSetId: "default-tools",
        sets: [
          {
            id: "default-tools",
            name: "Default",
            resourceNames: ["bash", "webfetch", "read", "write", "edit"],
            includeNewResources: false,
            includeAllResources: false,
          },
        ],
      },
      subagents: category("subagents"),
    },
    presets: [],
    version: 1,
  }
}
