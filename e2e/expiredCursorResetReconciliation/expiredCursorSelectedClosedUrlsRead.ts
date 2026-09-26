import type { Page } from "@playwright/test"
import "./expiredCursorSetup.js"

export async function expiredCursorSelectedClosedUrlsRead(page: Page, sessionId: string): Promise<string[]> {
  const path = `/api/sessions/${sessionId}/events`
  return page.evaluate(
    (selectedPath) =>
      (window.__codelineEventFeedClosedUrls ?? [])
        .map((url) => new URL(url, window.location.origin))
        .filter((url) => url.pathname === selectedPath)
        .map((url) => url.href),
    path,
  )
}
