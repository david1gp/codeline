import type { APIRequestContext } from "@playwright/test"

type E2eMetricsSnapshot = {
  metrics: Array<{ labels: Record<string, string>; name: string; value: number }>
}

/**
 * Reads the authenticated diagnostics metrics registry and returns a lookup for
 * a single counter. Counters that have never been incremented are absent from
 * the registry, so the lookup reports them as zero and callers can compare
 * deltas without seeding the registry first.
 */
export async function e2eMetricsCountersRead(
  request: APIRequestContext,
  origin: string,
): Promise<(name: string, labels?: Record<string, string>) => number> {
  const response = await request.get(`${origin}/api/diagnostics/metrics`)
  if (response.status() !== 200)
    throw new Error(`The managed diagnostics metrics endpoint returned ${response.status()}.`)

  const body = (await response.json()) as E2eMetricsSnapshot
  return (name, labels = {}) => {
    const entries = Object.entries(labels)
    const metric = body.metrics.find(
      (candidate) => candidate.name === name && entries.every(([key, value]) => candidate.labels[key] === value),
    )
    return metric?.value ?? 0
  }
}
