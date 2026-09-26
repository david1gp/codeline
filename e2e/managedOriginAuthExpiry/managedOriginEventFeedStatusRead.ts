import type { Page } from "@playwright/test"

/** Opens the feed with the same cookie jar as the live reconnect. */
export async function managedOriginEventFeedStatusRead(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const controller = new AbortController()
    const response = await fetch("/api/events", {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    })
    const reader = response.body?.getReader()
    if (reader !== undefined) {
      if (response.ok) await reader.read()
      await reader.cancel()
    }
    controller.abort()
    return response.status
  })
}
