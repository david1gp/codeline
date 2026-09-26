import * as v from "valibot"
export const settingsSectionSchema = v.picklist([
  "general",
  "subagents",
  "skills",
  "skill-sets",
  "commands",
  "command-sets",
  "tools",
  "tool-sets",
  "subagent-sets",
  "agent-presets",
])
export type SettingsSection = v.InferOutput<typeof settingsSectionSchema>
