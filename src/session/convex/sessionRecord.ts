export type SessionRecord = {
  archivedAt: number | null
  clientRequestId: string
  createdAt: number
  id: string
  metadata: unknown
  parentSessionId: string | null
  pinned: boolean
  primaryAgentId: string
  projectPath: string
  serverId: string
  title: string
  updatedAt: number
  userId: string
}
