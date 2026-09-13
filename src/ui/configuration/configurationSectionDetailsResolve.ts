import type { ConfigurationSection } from "./configurationSectionSchema.js"
const details = {
  commands: {
    contentLabel: "Command template",
    description: "Create reusable command templates for common project workflows.",
    itemLabel: "command",
    label: "Commands",
  },
  skills: {
    contentLabel: "Instructions",
    description: "Describe reusable guidance that can be applied to a task.",
    itemLabel: "skill",
    label: "Skills",
  },
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
