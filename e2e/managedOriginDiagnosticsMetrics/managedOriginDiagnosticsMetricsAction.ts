import { expect, type BrowserContext } from "@playwright/test"

export async function managedOriginDiagnosticsMetricsAction(context: BrowserContext) {
  const page = await context.newPage()
  await page.goto("/api/health")
  const opened = await page.evaluate(async () => {
    const controller = new AbortController()
    const response = await fetch("/api/events", {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    })
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error("The managed event feed has no readable body.")
    await reader.read()
    await reader.cancel()
    controller.abort()
    return response.status
  })
  expect(opened).toBe(200)
  await page.close()
}
