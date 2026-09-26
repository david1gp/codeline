import { expect, type Page } from "@playwright/test"

export async function managedOriginDiagnosticsIngestionAction(
  page: Page,
  baseOrigin: string,
  failedPath: string,
  marker: string,
  secret: string,
) {
  const pageErrorPromise = page.waitForEvent("pageerror", {
    predicate: (error) => error.message.includes(marker),
  })
  const requestFailedPromise = page.waitForEvent("requestfailed", {
    predicate: (request) => request.url().includes(failedPath),
  })
  const ingestionRequestPromise = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/api/diagnostics/logs"),
  )

  await page.evaluate(
    ({ failedUrl, marker, secret }) => {
      console.error(`${marker} console ${failedUrl} Bearer ${secret}`, {
        authorization: `Bearer ${secret}`,
        body: secret,
        url: `${failedUrl}#diagnostic-fragment`,
      })
      setTimeout(() => {
        throw new Error(`${marker} page error`)
      }, 0)
      void fetch(failedUrl).catch(() => undefined)
    },
    { failedUrl: `${baseOrigin}${failedPath}?token=${secret}`, marker, secret },
  )

  await Promise.all([pageErrorPromise, requestFailedPromise])
  const ingestionRequest = await ingestionRequestPromise
  expect(ingestionRequest.method()).toBe("POST")
}
