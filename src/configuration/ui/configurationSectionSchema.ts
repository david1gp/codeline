import * as v from "valibot"
export const configurationSectionSchema = v.picklist(["subagents"])
export type ConfigurationSection = v.InferOutput<typeof configurationSectionSchema>
