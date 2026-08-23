import { apiPreconditionFailedResponseCreate } from "../../api/conditional/apiPreconditionFailedResponseCreate.js"

export function notePreconditionFailedResponseCreate(input: {
  errorData?: string | null
  message: string
  op: string
}) {
  let current: { currentEtag?: string; currentRevision?: number } = {}
  if (input.errorData !== undefined && input.errorData !== null) {
    try {
      const parsed = JSON.parse(input.errorData) as unknown
      if (parsed !== null && typeof parsed === "object") {
        const candidate = parsed as { currentEtag?: unknown; currentRevision?: unknown }
        if (typeof candidate.currentEtag === "string") current.currentEtag = candidate.currentEtag
        if (typeof candidate.currentRevision === "number") current.currentRevision = candidate.currentRevision
      }
    } catch (_error) {
      current = {}
    }
  }
  return apiPreconditionFailedResponseCreate({
    ...(current.currentEtag === undefined ? {} : { currentEtag: current.currentEtag }),
    ...(current.currentRevision === undefined ? {} : { currentRevision: current.currentRevision }),
    message: input.message,
    op: input.op,
  })
}
