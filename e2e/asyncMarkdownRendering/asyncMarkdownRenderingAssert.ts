import { expect, type Locator, type Page } from "@playwright/test"

export async function asyncMarkdownRenderingAssert(page: Page, inFlightMessages: Locator, markdownPrompt: string) {
  const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
  const submittedRecentMessage = recentActivity
    .locator(':scope > li[data-session-message-role="user"]')
    .filter({ hasText: "Browser worker Markdown" })
    .first()
  await expect(submittedRecentMessage).toBeVisible({ timeout: 45_000 })
  // Semantic history intentionally renders the lightweight summary as text, not
  // as the full Markdown document rendered in the in-flight message body.
  await expect(submittedRecentMessage.getByText(markdownPrompt, { exact: true })).toBeVisible({ timeout: 45_000 })
  await expect(inFlightMessages).toHaveCount(0, { timeout: 45_000 })
}
