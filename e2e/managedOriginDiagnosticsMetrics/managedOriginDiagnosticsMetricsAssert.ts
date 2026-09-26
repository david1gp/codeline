import { expect, type Browser, type BrowserContext } from "@playwright/test"
import { e2eMetricsCountersRead } from "../e2eMetricsCountersRead.js"
import { managedOriginDiagnosticsMetricsAction } from "./managedOriginDiagnosticsMetricsAction.js"

export async function managedOriginDiagnosticsMetricsAssert(
  browser: Browser,
  context: BrowserContext,
  baseOrigin: string,
) {
  const unauthenticated = await browser.newContext({ baseURL: baseOrigin })
  const anonymousMetrics = await unauthenticated.request.get(`${baseOrigin}/api/diagnostics/metrics`)
  expect(anonymousMetrics.status()).toBe(401)
  await unauthenticated.close()

  const before = await e2eMetricsCountersRead(context.request, baseOrigin)
  await managedOriginDiagnosticsMetricsAction(context)

  // The connection teardown counter is recorded after the browser drops the
  // response, so the feed deltas are polled until the server has observed it.
  const request = context.request
  await expect
    .poll(
      async () => {
        const after = await e2eMetricsCountersRead(request, baseOrigin)
        return { opened: after("sse_connections_open_total") - before("sse_connections_open_total") }
      },
      { intervals: [250, 500, 1000, 2000], timeout: 30_000 },
    )
    .toEqual({ opened: 1 })
  await expect
    .poll(
      async () => {
        const after = await e2eMetricsCountersRead(request, baseOrigin)
        return (
          after("sse_connections_close_total") +
          after("sse_connections_disconnect_total") -
          before("sse_connections_close_total") -
          before("sse_connections_disconnect_total")
        )
      },
      { intervals: [250, 500, 1000, 2000], timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(1)
}
