import { type BrowserContext, expect, type Page } from "@playwright/test"

export async function newProjectFlowFirstMessageAssert(
  context: BrowserContext,
  page: Page,
  sessionId: string,
  prompt: string,
): Promise<void> {
  const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const syncTimeout = 45_000
  await expect
    .poll(
      async () => {
        const response = await context.request.get(
          `${baseOrigin}/api/sessions/${encodeURIComponent(sessionId)}/messages`,
        )
        expect(response.ok(), await response.text()).toBe(true)
        const body = (await response.json()) as { messages: Array<{ content: string; role: string }> }
        return body.messages.filter((message) => message.role === "user").map((message) => message.content)
      },
      { timeout: syncTimeout },
    )
    .toEqual([prompt])
  const persistedUserMessage = page
    .getByRole("list", { name: "Recent semantic activity", exact: true })
    .locator('li[data-session-message-role="user"]')
  await expect(persistedUserMessage).toHaveCount(1, { timeout: syncTimeout })
  await expect(persistedUserMessage).toContainText(prompt, { timeout: syncTimeout })
  await page.reload()
  await expect(persistedUserMessage).toHaveCount(1, { timeout: syncTimeout })
  await expect(persistedUserMessage).toContainText(prompt, { timeout: syncTimeout })
}
