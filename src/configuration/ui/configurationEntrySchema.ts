import * as v from "valibot"
export const configurationEntrySchema = v.object({
  content: v.string(),
  description: v.string(),
  enabled: v.boolean(),
  id: v.string(),
  name: v.string(),
})
export type ConfigurationEntry = v.InferOutput<typeof configurationEntrySchema>
