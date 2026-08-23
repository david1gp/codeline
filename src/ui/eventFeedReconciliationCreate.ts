import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiHttpClientCreate } from "../api/client/apiHttpClientCreate.js"
import type { EventFeedReconciliationCallbacks, EventFeedResetBootstrap } from "../events/client/eventFeedCreate.js"
import { runStatusSchema } from "../run/schema/runStatusSchema.js"
import { sessionStreamSnapshotFetch } from "../run/ui/sessionStreamSnapshotFetch.js"
import {
  type SessionSnapshotResponse,
  sessionSnapshotResponseSchema,
} from "../session/api/sessionSnapshotResponseSchema.js"
import { sessionListPageLoad } from "../session/client/sessionListPageLoad.js"
import type { EventFeedResourceRevision, EventFeedStaleResource } from "../stream/client/eventFeedStateCreate.js"

type EventFeedReconciliationCreateOptions = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  settledSnapshotCacheWrite?: (snapshot: SessionSnapshotResponse) => Result<void> | Promise<Result<void>>
}

function eventFeedResourceRevisionCreate(input: EventFeedStaleResource): EventFeedResourceRevision {
  return {
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    revision: input.serverRevision,
  }
}

function eventFeedActiveRunPartialTextResolve(
  events: readonly { payload: unknown; sequence: number; streamId: string }[],
  streamId: string,
): { lastSequence: number; partialText: string } {
  let lastSequence = 1
  let partialText = ""
  for (const event of events) {
    if (event.streamId !== streamId) continue
    lastSequence = Math.max(lastSequence, event.sequence)
    if (typeof event.payload !== "object" || event.payload === null) continue
    const delta = (event.payload as { delta?: unknown }).delta
    if (typeof delta === "string") partialText += delta
  }
  return { lastSequence, partialText }
}

async function eventFeedActiveRunSnapshotLoad(
  input: Parameters<EventFeedReconciliationCallbacks["activeRunSnapshotLoad"]>[0],
  dependencies: EventFeedReconciliationCreateOptions,
) {
  const loaded = await sessionStreamSnapshotFetch(input.sessionId, { fetch: dependencies.fetch })
  if (!loaded.success) return createResultError("eventFeedActiveRunSnapshotLoad", loaded.errorMessage)
  const run = loaded.data.runs.find(
    (candidate) => candidate.id === input.runId || candidate.clientRunId === input.runId,
  )
  if (run === undefined)
    return createResultError("eventFeedActiveRunSnapshotLoad", "The active run could not be found.")
  const status = v.safeParse(runStatusSchema, run.status)
  if (!status.success) return createResultError("eventFeedActiveRunSnapshotLoad", "The active run status is invalid.")
  const partial = eventFeedActiveRunPartialTextResolve(loaded.data.events, run.streamId)
  return createResult({
    lastSequence: partial.lastSequence,
    partialText: partial.partialText,
    runId: input.runId,
    sessionId: input.sessionId,
    status: status.output,
  })
}

export function eventFeedReconciliationCreate(
  options: EventFeedReconciliationCreateOptions,
): EventFeedReconciliationCallbacks {
  const client = apiHttpClientCreate({ fetch: options.fetch })
  const shellListBootstrap = async (
    input: Extract<Parameters<EventFeedReconciliationCallbacks["shellListBootstrap"]>[0], { kind: "reset" }>,
  ): Promise<Result<EventFeedResetBootstrap>> => {
    const loaded = await sessionListPageLoad(client, { limit: 100 })
    if (!loaded.success) return createResultError("eventFeedResetBootstrap", loaded.errorMessage)
    return createResult({
      activeRuns: [],
      asOfCursor: loaded.data.asOfCursor,
      resetCheckpoint: input.resetCheckpoint,
      resourceRevisions: [],
    })
  }
  const resourceRevalidate = async (input: EventFeedStaleResource): Promise<Result<EventFeedResourceRevision>> =>
    createResult(eventFeedResourceRevisionCreate(input))
  const sessionSnapshotLoad: EventFeedReconciliationCallbacks["sessionSnapshotLoad"] = (input) =>
    client.get({
      op: "eventFeedSessionSnapshotLoad",
      path: `/api/sessions/${encodeURIComponent(input.sessionId)}/snapshot`,
      responseSchema: sessionSnapshotResponseSchema,
    })
  const sessionSnapshotReplace: EventFeedReconciliationCallbacks["sessionSnapshotReplace"] = async (snapshot) => {
    if (options.settledSnapshotCacheWrite === undefined) return createResult(undefined)
    try {
      return await options.settledSnapshotCacheWrite(snapshot)
    } catch (_error) {
      return createResultError("eventFeedSessionSnapshotReplace", "The settled session snapshot could not be cached.")
    }
  }
  const visibleResources: EventFeedReconciliationCallbacks["visibleResources"] = () => []

  return {
    activeRunSnapshotLoad: (input) => eventFeedActiveRunSnapshotLoad(input, options),
    resourceRevalidate,
    sessionSnapshotLoad,
    sessionSnapshotReplace,
    shellListBootstrap,
    visibleResources,
  }
}
