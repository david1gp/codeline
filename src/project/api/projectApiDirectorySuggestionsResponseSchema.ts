import * as v from "valibot"
import { projectDiscoveryLimits } from "../projectDiscoveryLimits.js"

const projectApiDirectorySuggestionSchema = v.strictObject({
  label: v.string(),
  path: v.string(),
})

export const projectApiDirectorySuggestionsResponseSchema = v.strictObject({
  suggestions: v.pipe(
    v.array(projectApiDirectorySuggestionSchema),
    v.maxLength(projectDiscoveryLimits.maximumSuggestions),
  ),
})

export type ProjectApiDirectorySuggestionsResponse = v.InferOutput<typeof projectApiDirectorySuggestionsResponseSchema>
