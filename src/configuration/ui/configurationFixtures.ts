import type { ConfigurationEntry } from "./configurationEntrySchema.js"
import type { ConfigurationSection } from "./configurationSectionSchema.js"
export const configurationFixtures = {
  subagents: [
    {
      content:
        "Review the requested change for correctness, accessibility, and regressions. Return findings with file references.",
      description: "Performs a focused, read-only implementation review.",
      enabled: true,
      id: "reviewer",
      name: "Reviewer",
    },
    {
      content:
        "Explore the repository and report relevant files, conventions, dependencies, and tests. Do not edit files.",
      description: "Maps unfamiliar areas of a codebase before implementation.",
      enabled: true,
      id: "explorer",
      name: "Explorer",
    },
  ],
} as const satisfies Record<ConfigurationSection, readonly ConfigurationEntry[]>
