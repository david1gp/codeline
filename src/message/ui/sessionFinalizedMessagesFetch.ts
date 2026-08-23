import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import type { MessageApiRecord } from "../api/messageApiRecordSchema.js"
import { messagePageResponseSchema } from "../api/messagePageResponseSchema.js"

const messagePageLimit = 100
const messagePageMax = 200

export type SessionFinalizedMessages = {
  asOfCursor: string
  etag: string
  messages: readonly MessageApiRecord[]
  revision: number
}

/**
 * Typed `GET /api/sessions/:sessionId/messages` read that follows `nextCursor`
 * so the caller receives the whole finalized history in server sequence order.
 * The last page supplies the authoritative ETag, revision, and journal cursor.
 */
export async function sessionFinalizedMessagesFetch(
  sessionId: string,
  dependencies: {
    fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    signal?: AbortSignal
  } = {},
): Promise<Result<SessionFinalizedMessages>> {
  const op = "sessionFinalizedMessagesFetch"
  if (sessionId.trim().length === 0) return createResultError(op, "The session identifier is required.")

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  const path = `/api/sessions/${encodeURIComponent(sessionId)}/messages`
  const messages: MessageApiRecord[] = []
  let cursor: string | undefined

  for (let index = 0; index < messagePageMax; index += 1) {
    const result = await client.get({
      op,
      path,
      query: { limit: String(messagePageLimit), ...(cursor === undefined ? {} : { cursor }) },
      responseSchema: messagePageResponseSchema,
      ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
    })
    if (!result.success) return result

    messages.push(...result.data.messages)
    if (!result.data.hasMore || result.data.nextCursor === null) {
      return createResult({
        asOfCursor: result.data.asOfCursor,
        etag: result.data.etag,
        messages,
        revision: result.data.revision,
      })
    }
    cursor = result.data.nextCursor
  }

  return createResultError(op, "The finalized message history exceeded the supported page count.")
}
