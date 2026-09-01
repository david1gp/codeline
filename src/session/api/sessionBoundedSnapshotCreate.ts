import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { messageApiRecordCreate } from "../../message/api/messageApiRecordCreate.js"
import { executionToolPayloadBound } from "../../stream/actions/executionToolPayloadBound.js"
import type { SessionBoundedSnapshot } from "./sessionBoundedSnapshotSchema.js"
import { sessionBoundedSnapshotSchema } from "./sessionBoundedSnapshotSchema.js"

type SessionBoundedSnapshotMessageSource = Parameters<typeof messageApiRecordCreate>[0]

function sessionLatestAnswerProject(message: SessionBoundedSnapshotMessageSource): SessionBoundedSnapshotMessageSource {
  const boundedMetadata = executionToolPayloadBound(message.metadata)
  return {
    ...message,
    content: executionToolPayloadBound(message.content, "text").content,
    metadata: JSON.parse(boundedMetadata.content) as unknown,
  }
}

export function sessionBoundedSnapshotCreate(input: {
  detailCursor: string
  hasMore: boolean
  latestAnswer: SessionBoundedSnapshotMessageSource | null
  olderCursor: string | null
  semanticSteps: SessionBoundedSnapshot["semanticSteps"]
  session: SessionBoundedSnapshot["session"]
  state: SessionBoundedSnapshot["state"]
  throughPosition: number
}): Result<SessionBoundedSnapshot> {
  const op = "sessionBoundedSnapshotCreate"

  let latestAnswer: SessionBoundedSnapshot["latestAnswer"] = null
  if (input.latestAnswer !== null) {
    const message = messageApiRecordCreate(sessionLatestAnswerProject(input.latestAnswer))
    if (!message.success) return createResultError(op, message.errorMessage)
    latestAnswer = message.data
  }

  const parsed = v.safeParse(sessionBoundedSnapshotSchema, {
    detailCursor: input.detailCursor,
    hasMore: input.hasMore,
    latestAnswer,
    olderCursor: input.olderCursor,
    semanticSteps: input.semanticSteps,
    session: input.session,
    state: input.state,
    throughPosition: input.throughPosition,
  })
  if (!parsed.success) return createResultError(op, "The bounded session snapshot representation is invalid.")
  return createResult(parsed.output)
}
