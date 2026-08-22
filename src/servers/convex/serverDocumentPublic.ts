import type { ServerRecord } from "./serverRecord.js"

type ServerDocument = ServerRecord & {
  _creationTime?: number
  _id?: string
}

export function serverDocumentPublic(document: ServerDocument): ServerRecord {
  return {
    createdAt: document.createdAt,
    endpoint: document.endpoint,
    id: document.id,
    metadata: document.metadata,
    name: document.name,
    organizationId: document.organizationId,
    updatedAt: document.updatedAt,
  }
}
