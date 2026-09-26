import * as v from "valibot"

export const sessionAgentPromptSchema = v.pipe(v.string(), v.trim())

export type SessionAgentPrompt = v.InferOutput<typeof sessionAgentPromptSchema>
