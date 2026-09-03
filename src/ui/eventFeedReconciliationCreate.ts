import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../api/client/apiHttpClientCreate.js"
import type { EventFeedReconciliationCallbacks, EventFeedResetBootstrap } from "../events/client/eventFeedCreate.js"
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
      asOfCursor: loaded.data.asOfCursor,
      resetCheckpoint: input.resetCheckpoint,
      resourceRevisions: [],
    })
  }
  const resourceRevalidate = async (input: EventFeedStaleResource): Promise<Result<EventFeedResourceRevision>> =>
    createResult(eventFeedResourceRevisionCreate(input))
  const visibleResources: EventFeedReconciliationCallbacks["visibleResources"] = () => []

  return {
    resourceRevalidate,
    shellListBootstrap,
    visibleResources,
  }
}
