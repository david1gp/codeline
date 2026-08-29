import type { CompactionTokenUsage } from "./compactionTokenUsage.js"

export type CompactionMessage = {
  content?: unknown
  id?: string
  metadata?: unknown
  role: "assistant" | "activity" | "developer" | "reasoning" | "system" | "tool" | "user"
  reportedUsage?: CompactionTokenUsage
  sequence?: number
  toolCallId?: string
  toolCalls?: readonly {
    arguments?: unknown
    id?: string
    name?: string
    toolCallId?: string
  }[]
}
