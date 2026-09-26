import type { Page } from "@playwright/test"
import "./expiredCursorSetup.js"

export async function expiredCursorSelectedLiveUrlsRead(page: Page, sessionId: string): Promise<string[]> {
  const path = `/api/sessions/${sessionId}/events`
  return page.evaluate((selectedPath) => {
    const normalize = (url: string) => new URL(url, window.location.origin)
    const created = (window.__codelineEventFeedUrls ?? [])
      .map(normalize)
      .filter((url) => url.pathname === selectedPath)
      .map((url) => url.href)
    const closedCounts = new Map<string, number>()
    for (const rawUrl of window.__codelineEventFeedClosedUrls ?? []) {
      const url = normalize(rawUrl)
      if (url.pathname !== selectedPath) continue
      closedCounts.set(url.href, (closedCounts.get(url.href) ?? 0) + 1)
    }
    const live: string[] = []
    for (const url of created) {
      const closedCount = closedCounts.get(url) ?? 0
      if (closedCount > 0) {
        closedCounts.set(url, closedCount - 1)
        continue
      }
      live.push(url)
    }
    return live
  }, path)
}
