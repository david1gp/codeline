import { type BrowserContext, type Page, expect } from "@playwright/test"
import { contextCompactionMessagesRead } from "./contextCompactionMessagesRead.js"

export async function contextCompactionReloadAssert(
  page: Page,
  context: BrowserContext,
  sessionId: string,
  historyPrompts: string[],
  sourceMessages: Array<{ content: string; role: string }>,
): Promise<void> {
  await page.reload()
  const activity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
  await expect(activity).toBeVisible({ timeout: 45_000 })
  await expect(activity.locator(':scope > li[data-session-message-role="user"]')).toHaveCount(historyPrompts.length, {
    timeout: 45_000,
  })
  await expect(activity.locator(':scope > li[data-session-message-role="assistant"]')).toHaveCount(
    historyPrompts.length,
    { timeout: 45_000 },
  )
  for (const prompt of historyPrompts) {
    await expect(activity.getByText(prompt.slice(0, prompt.indexOf("\n")), { exact: false })).toBeVisible({
      timeout: 45_000,
    })
  }
  await expect(page.getByText("/compact", { exact: true })).toHaveCount(0)
  expect(await contextCompactionMessagesRead(context, sessionId)).toEqual(sourceMessages)
}
