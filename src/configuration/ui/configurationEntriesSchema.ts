import * as v from "valibot"
import { configurationEntrySchema } from "./configurationEntrySchema.js"
export const configurationEntriesSchema = v.array(configurationEntrySchema)
export type ConfigurationEntries = v.InferOutput<typeof configurationEntriesSchema>
