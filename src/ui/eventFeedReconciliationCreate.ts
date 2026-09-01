import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../api/client/apiHttpClientCreate.js"
import type { EventFeedReconciliationCallbacks, EventFeedResetBootstrap } from "../events/client/eventFeedCreate.js"
import { runActiveSnapshotFetch } from "../run/ui/runActiveSnapshotFetch.js"
import { sessionSnapshotResponseSchema } from "../session/api/sessionSnapshotResponseSchema.js"
import { sessionListPageLoad } from "../session/client/sessionListPageLoad.js"
import type { EventFeedResourceRevision, EventFeedStaleResource } from "../stream/client/eventFeedStateCreate.js"

type EventFeedReconciliationCreateOptions = {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

function eventFeedResourceRevisionCreate(input: EventFeedStaleResource): EventFeedResourceRevision {
  return {
    resourceId: input.resourceId,
    resourceType: input.resourceType,
    revision: input.serverRevision,
  }
}

/**
 * Reload and reset reconciliation read the run-specific active snapshot so
 * partial output comes from one consistent server snapshot. The feed is then
 * attached after the returned `lastSequence` rather than an arbitrary cursor.
 */
async function eventFeedActiveRunSnapshotLoad(
  input: Parameters<EventFeedReconciliationCallbacks["activeRunSnapshotLoad"]>[0],
  dependencies: EventFeedReconciliationCreateOptions,
) {
  const loaded = await runActiveSnapshotFetch(input.sessionId, input.runId, { fetch: dependencies.fetch })
  if (!loaded.success) return createResultError("eventFeedActiveRunSnapshotLoad", loaded.errorMessage)
  return createResult({
    lastSequence: loaded.data.lastSequence,
    partialText: loaded.data.partialText,
    runId: input.runId,
    sessionId: input.sessionId,
    status: loaded.data.status,
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
  const sessionSnapshotReplace: EventFeedReconciliationCallbacks["sessionSnapshotReplace"] = () =>
    createResult(undefined)
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
