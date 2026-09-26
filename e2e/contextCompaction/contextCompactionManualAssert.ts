import { type BrowserContext, type Page, expect } from "@playwright/test"
import { contextCompactionChatSubmit } from "./contextCompactionChatSubmit.js"
import { contextCompactionMessagesRead } from "./contextCompactionMessagesRead.js"
import { contextCompactionRunSnapshotRead } from "./contextCompactionRunSnapshotRead.js"

export async function contextCompactionManualAssert(
  page: Page,
  context: BrowserContext,
  sessionId: string,
  historyPrompts: string[],
  sourceMessages: Array<{ content: string; role: string }>,
): Promise<void> {
  const manualResponse = await contextCompactionChatSubmit(page, sessionId, "/compact")
  expect(manualResponse.sessionId).toBe(sessionId)
  await expect
    .poll(async () => (await contextCompactionRunSnapshotRead(context, sessionId, manualResponse.runId)).status, {
      timeout: 45_000,
    })
    .toBe("succeeded")
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  await expect
    .poll(
      async () => {
        const response = await context.request.get(`${origin}/api/sessions/${sessionId}/active-runs`)
        expect(response.ok(), await response.text()).toBe(true)
        return ((await response.json()) as { runs: unknown[] }).runs.length
      },
      { timeout: 45_000 },
    )
    .toBe(0)
  await expect(page.getByText("Response complete.", { exact: true })).toBeVisible({ timeout: 45_000 })
  const afterManualMessages = await contextCompactionMessagesRead(context, sessionId)
  expect(afterManualMessages).toEqual(sourceMessages)
  expect(afterManualMessages.some(({ content }) => content.trim() === "/compact")).toBe(false)
  const activity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
  await expect(activity.locator(':scope > li[data-session-message-role="user"]')).toHaveCount(historyPrompts.length)
  await expect(activity.locator(':scope > li[data-session-message-role="assistant"]')).toHaveCount(
    historyPrompts.length,
  )
  await expect(page.getByText("/compact", { exact: true })).toHaveCount(0)
}
