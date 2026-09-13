import * as v from "valibot"
export const configurationSectionSchema = v.picklist(["subagents", "skills", "commands"])
export type ConfigurationSection = v.InferOutput<typeof configurationSectionSchema>
