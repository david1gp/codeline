export type SessionSidebarSession = {
  id: string
  parentSessionId?: string | null
  projectPath: string
  title: string
  updatedAt: Date | number | string
  watched: boolean
  working: boolean
}
