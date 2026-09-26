import { type BrowserContext, type Page, expect } from "@playwright/test"
import { contextCompactionChatSubmit } from "./contextCompactionChatSubmit.js"
import { contextCompactionRunSnapshotRead } from "./contextCompactionRunSnapshotRead.js"

export async function contextCompactionFollowUpAssert(
  page: Page,
  context: BrowserContext,
  sessionId: string,
  runId: string,
  historyLength: number,
): Promise<void> {
  const followUp = `post-compaction follow-up ${runId}`
  const response = await contextCompactionChatSubmit(page, sessionId, followUp)
  expect(response.sessionId).toBe(sessionId)
  const activity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
  await expect(activity.getByText(followUp, { exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(activity.locator(':scope > li[data-session-message-role="assistant"]')).toHaveCount(historyLength + 1, {
    timeout: 45_000,
  })
  await expect(page.getByRole("region", { name: "Latest agent answer", exact: true })).toContainText(
    "Summary generation completed.",
    { timeout: 45_000 },
  )
  await expect(page.getByRole("list", { name: "In-flight messages" })).toHaveCount(0, { timeout: 45_000 })
  await expect
    .poll(async () => (await contextCompactionRunSnapshotRead(context, sessionId, response.runId)).status, {
      timeout: 45_000,
    })
    .toBe("succeeded")
}
