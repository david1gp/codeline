export type SessionSidebarSession = {
  id: string
  parentSessionId?: string | null
  projectId?: string
  projectPath: string
  title: string
  updatedAt: Date | number | string
  pinned: boolean
  working: boolean
}
