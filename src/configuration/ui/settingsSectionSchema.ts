import * as v from "valibot"
export const settingsSectionSchema = v.picklist(["general", "subagents", "skills", "commands"])
export type SettingsSection = v.InferOutput<typeof settingsSectionSchema>
