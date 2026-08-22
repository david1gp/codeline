import type { NoteRecord } from "./noteRecord.js"

type NoteDocument = Omit<NoteRecord, "projectPath"> & {
  _creationTime?: number
  _id?: string
  projectPath?: string
}

export function noteDocumentPublic(document: NoteDocument): NoteRecord {
  return {
    content: document.content,
    createdAt: document.createdAt,
    id: document.id,
    projectPath: document.projectPath ?? null,
    ...(document.sortOrder === undefined ? {} : { sortOrder: document.sortOrder }),
    updatedAt: document.updatedAt,
    userId: document.userId,
  }
}
