export type MessageRecord = {
  agentId: string
  clientRequestId: string
  content: string
  createdAt: number
  finalizedAt: number
  id: string
  metadata: unknown
  role: "assistant" | "user"
  sequence: number
  sessionId: string
}
