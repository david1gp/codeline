import { createResultError } from "@adaptive-ds/result"
import { useContext } from "solid-js"
import type { RunDetailResponse } from "../run/api/runDetailResponseSchema.js"
import type { RunToolDetailResponse } from "../run/api/runToolDetailResponseSchema.js"
import { runDetailFetch } from "../run/ui/runDetailFetch.js"
import { runToolDetailFetch } from "../run/ui/runToolDetailFetch.js"
import type { SessionSemanticStep } from "../session/api/sessionSemanticStepSchema.js"
import { apiFetchContext } from "./apiFetchContext.js"
import { httpQueryStateCreate } from "./httpQueryStateCreate.js"
import type { SessionChildConversationLink } from "./sessionChildConversationLink.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type SessionSemanticStepRowStateOptions = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  onChildConversation?: (link: SessionChildConversationLink) => void
  sessionId: () => string
  step: () => SessionSemanticStep
}

export function sessionSemanticStepRowStateCreate(options: SessionSemanticStepRowStateOptions) {
  const fetcher = useContext(apiFetchContext)
  const expanded = signalObjectCreate(false)
  const key = () => {
    const step = options.step()
    if (step.kind !== "run" && step.kind !== "tool") return undefined
    return `${options.sessionId()}:${step.kind}:${step.detailId}`
  }
  const query = httpQueryStateCreate<RunDetailResponse | RunToolDetailResponse>({
    enabled: expanded.get,
    key,
    load: (_key, signal) => {
      const step = options.step()
      const selectedFetch = options.fetch ?? fetcher
      const dependencies = { ...(selectedFetch === undefined ? {} : { fetch: selectedFetch }), signal }
      if (step.kind === "run") return runDetailFetch(options.sessionId(), step.detailId, dependencies)
      if (step.kind === "tool") return runToolDetailFetch(options.sessionId(), step.runId, step.detailId, dependencies)
      return Promise.resolve(createResultError("sessionSemanticStepDetailLoad", "This activity has no full details."))
    },
  })

  return {
    childConversationOpen: () => {
      const step = options.step()
      if (step.kind !== "tool" || step.childReference == null) return
      options.onChildConversation?.({ ...step.childReference, task: step.summary })
    },
    detail: query.data,
    detailExpand: () => expanded.set(true),
    detailRetry: query.retry,
    isDetailError: query.isError,
    isDetailLoading: query.isLoading,
  }
}
