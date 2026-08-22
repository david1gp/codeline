export type NoteRecord = {
  content: string
  createdAt: number
  id: string
  projectPath: string | null
  sortOrder?: number
  updatedAt: number
  userId: string
}
