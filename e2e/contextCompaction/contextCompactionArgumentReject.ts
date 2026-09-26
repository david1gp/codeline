import { type BrowserContext, type Page, expect } from "@playwright/test"
import { contextCompactionMessagesRead } from "./contextCompactionMessagesRead.js"

export async function contextCompactionArgumentReject(
  page: Page,
  context: BrowserContext,
  sessionId: string,
): Promise<void> {
  // This non-exact command goes through ordinary chat parsing and is rejected.
  const composer = page.getByRole("form", { name: "Chat composer" })
  const input = composer.getByLabel("Message")
  await expect(input).toBeEnabled({ timeout: 45_000 })
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith(`/api/sessions/${sessionId}/chat`),
  )
  await input.fill("/compact arg")
  await composer.getByRole("button", { name: "Send" }).click()
  const response = await responsePromise
  expect(response.status()).toBe(400)
  expect(
    (await contextCompactionMessagesRead(context, sessionId)).some(({ content }) => content.trim() === "/compact arg"),
  ).toBe(false)
}
