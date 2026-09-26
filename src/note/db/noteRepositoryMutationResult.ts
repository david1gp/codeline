import type { NoteApiRecord } from "../api/noteApiRecordSchema.js"

export type NoteRepositoryMutationResult = {
  affectedNotes: Array<{ id: string; revision: number }>
  created?: boolean
  deleted?: boolean
  replayed: boolean
  responseBody?: NoteApiRecord
}
