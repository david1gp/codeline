import type { SessionRecord } from "./sessionRecord.js"

type SessionDocument = Omit<SessionRecord, "archivedAt" | "parentSessionId"> & {
  archivedAt?: number | null
  _creationTime?: number
  _id?: string
  parentSessionId?: string | null
}

export function sessionDocumentPublic(document: SessionDocument): SessionRecord {
  return {
    archivedAt: document.archivedAt ?? null,
    clientRequestId: document.clientRequestId,
    createdAt: document.createdAt,
    id: document.id,
    metadata: document.metadata,
    parentSessionId: document.parentSessionId ?? null,
    pinned: document.pinned,
    primaryAgentId: document.primaryAgentId,
    projectPath: document.projectPath,
    serverId: document.serverId,
    title: document.title,
    updatedAt: document.updatedAt,
    userId: document.userId,
  }
}
