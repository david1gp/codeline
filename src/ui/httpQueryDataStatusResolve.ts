/** Retained-data lifecycle of one or more shared-cache HTTP reads. */
export type HttpQueryDataStatus = "offline" | "reconciling" | "ready" | "stale"

type HttpQueryDataStatusQuery = {
  data: () => unknown
  isError: () => boolean
  isLoading: () => boolean
}

/**
 * Retained rows stay rendered while a revalidation is in flight (`reconciling`)
 * or failed (`stale`). Offline wins over both, because no revalidation can
 * settle without a network.
 */
export function httpQueryDataStatusResolve(input: {
  isOnline: boolean
  queries: readonly HttpQueryDataStatusQuery[]
}): HttpQueryDataStatus {
  if (!input.isOnline) return "offline"
  const hasRetained = input.queries.some((query) => query.data() !== undefined)
  if (input.queries.some((query) => query.isError())) return hasRetained ? "stale" : "reconciling"
  if (input.queries.some((query) => query.isLoading())) return "reconciling"
  return "ready"
}
