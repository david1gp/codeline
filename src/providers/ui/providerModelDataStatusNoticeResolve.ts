import type { HttpQueryDataStatus } from "../../ui/httpQueryDataStatusResolve.js"

/**
 * Wording for the retained-data lifecycle of the provider catalog and session
 * target representations. `ready` renders nothing, because the selector already
 * shows the authoritative models.
 */
export function providerModelDataStatusNoticeResolve(status: HttpQueryDataStatus): string | undefined {
  if (status === "offline") return "Offline — showing the last loaded models."
  if (status === "reconciling") return "Reconciling models…"
  if (status === "stale") return "Stale — the last loaded models could not be revalidated."
  return undefined
}
