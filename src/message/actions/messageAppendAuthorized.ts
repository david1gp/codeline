import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { journalWriteCreate } from "../../journal/actions/journalWriteCreate.js"
import type { MessageAppendResponse } from "../api/messageAppendResponseSchema.js"
import { messageRepositoryAppendMutation } from "../db/messageRepositoryAppendMutation.js"
import type { MessageAppendRequest } from "../schema/messageAppendRequestSchema.js"

type MessageAppendMutation =
  Awaited<ReturnType<typeof messageRepositoryAppendMutation>> extends Result<infer T> ? T : never

export function messageAppendAuthorized(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  sessionId: string,
  input: MessageAppendRequest,
  options: {
    postCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
    resolveRecipients: JournalEventRecipientResolver
  },
): Promise<
  Result<{
    created: boolean
    replayed: boolean
    responseBody: MessageAppendResponse
  }>
> {
  const writer = journalWriteCreate({
    database,
    postCommitPublish: options.postCommitPublish,
    resolveRecipients: options.resolveRecipients,
  })
  let mutation: MessageAppendMutation | undefined

  const committed = writer.run({
    mutate: async (transaction) => {
      const result = await messageRepositoryAppendMutation(transaction, userId, organizationId, sessionId, input)
      if (result.success) mutation = result.data
      return result
    },
    resources: [{ resourceId: sessionId, resourceType: "session" }],
    write: async (_transaction, journal) => {
      if (mutation === undefined) return createResultError("messageAppendAuthorized", "The message result is missing.")
      if (mutation.replayed) return createResult(undefined)
      const appended = await journal.append({
        eventType: "invalidate",
        payload: { resourceId: sessionId, resourceType: "session", revision: mutation.revision },
        resource: { resourceId: sessionId, resourceType: "session" },
      })
      if (!appended.success) return createResultError("messageAppendAuthorized", appended.errorMessage)
      return createResult(undefined)
    },
  })
  return committed.then((result) => {
    if (!result.success) return result
    return createResult({
      created: result.data.created,
      replayed: result.data.replayed,
      responseBody: result.data.responseBody,
    })
  })
}
