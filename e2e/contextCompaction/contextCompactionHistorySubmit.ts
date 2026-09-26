import { type BrowserContext, type Page, expect } from "@playwright/test"
import { contextCompactionChatSubmit } from "./contextCompactionChatSubmit.js"
import { contextCompactionMessagesRead } from "./contextCompactionMessagesRead.js"

export async function contextCompactionHistorySubmit(
  page: Page,
  context: BrowserContext,
  sessionId: string,
  runId: string,
) {
  const composer = page.getByRole("form", { name: "Chat composer" })
  await expect(composer).toBeVisible({ timeout: 45_000 })
  await expect(composer.getByLabel("Message")).toBeEnabled({ timeout: 45_000 })
  // Long, run-unique source history leaves older messages eligible for manual compaction.
  const durableBlock = "This deterministic source history must remain available after compaction. "
    .repeat(120)
    .trimEnd()
  const historyPrompts = ["source goal", "source constraint", "source decision", "source progress"].map(
    (label) => `${label} ${runId}\n${durableBlock}`,
  )
  for (const [index, prompt] of historyPrompts.entries()) {
    const response = await contextCompactionChatSubmit(page, sessionId, prompt)
    expect(response.sessionId).toBe(sessionId)
    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    const userRows = recentActivity.locator(':scope > li[data-session-message-role="user"]')
    const assistantRows = recentActivity.locator(':scope > li[data-session-message-role="assistant"]')
    await expect(userRows).toHaveCount(index + 1, { timeout: 45_000 })
    await expect(assistantRows).toHaveCount(index + 1, { timeout: 45_000 })
    await expect(assistantRows.nth(index)).toContainText("Summary generation completed.", { timeout: 45_000 })
    await expect(page.getByRole("list", { name: "In-flight messages" })).toHaveCount(0, { timeout: 45_000 })
  }
  const sourceMessages = await contextCompactionMessagesRead(context, sessionId)
  expect(sourceMessages.map(({ content }) => content)).toEqual(
    historyPrompts.flatMap((prompt) => [prompt, expect.any(String)]),
  )
  expect(sourceMessages.filter(({ role }) => role === "user")).toHaveLength(historyPrompts.length)
  expect(sourceMessages.some(({ content }) => content.trim() === "/compact")).toBe(false)
  return { historyPrompts, sourceMessages }
}
