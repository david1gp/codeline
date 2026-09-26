import type { BrowserContext } from "@playwright/test"
import { expect } from "@playwright/test"

const syncTimeout = 30_000

export async function lunaPingPongAction(context: BrowserContext, sessionId: string) {
  const page = await context.newPage()
  await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)
  const composer = page.getByRole("form", { name: "Chat composer" })
  await expect(composer).toBeVisible({ timeout: syncTimeout })
  const messageInput = composer.getByLabel("Message")
  await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
  await messageInput.fill("ping")
  await composer.getByRole("button", { name: "Send" }).click()
  return page
}
