import type { ConfigurationSection } from "./configurationSectionSchema.js"
const details = {
  subagents: {
    contentLabel: "System instructions",
    description: "Define focused assistants with a clear role and operating instructions.",
    itemLabel: "subagent",
    label: "Subagents",
  },
} as const satisfies Record<ConfigurationSection, object>
export function configurationSectionDetailsResolve(section: ConfigurationSection) {
  return details[section]
}
