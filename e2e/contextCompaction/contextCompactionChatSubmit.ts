import { type Page, expect } from "@playwright/test"

export async function contextCompactionChatSubmit(
  page: Page,
  sessionId: string,
  prompt: string,
): Promise<{ runId: string; sessionId: string }> {
  const composer = page.getByRole("form", { name: "Chat composer" })
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith(`/api/sessions/${sessionId}/chat`),
  )
  await composer.getByLabel("Message").fill(prompt)
  await composer.getByRole("button", { name: "Send" }).click()
  const response = await responsePromise
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as { runId: string; sessionId: string }
}
