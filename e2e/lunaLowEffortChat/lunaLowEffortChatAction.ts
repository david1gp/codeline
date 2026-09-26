import { expect, type Page } from "@playwright/test"

const lunaModelSelection = "codex-lb/gpt-5.6-luna"
const syncTimeout = 120_000

export async function lunaLowEffortChatAction(page: Page, sessionId: string) {
  const providerModel = page.getByLabel("Provider model")
  const reasoningEffort = page.getByLabel("Reasoning effort")
  await expect(providerModel).toBeEnabled({ timeout: syncTimeout })
  await providerModel.selectOption(lunaModelSelection)
  await expect(providerModel).toHaveValue(lunaModelSelection)
  await expect(reasoningEffort).toBeEnabled({ timeout: syncTimeout })
  await reasoningEffort.selectOption("low")
  await expect(reasoningEffort).toHaveValue("low")

  const chatRequestPromise = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith(`/api/sessions/${sessionId}/chat`),
  )
  const composer = page.getByRole("form", { name: "Chat composer" })
  await expect(composer).toBeVisible({ timeout: syncTimeout })
  const messageInput = composer.getByLabel("Message")
  await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
  await messageInput.fill("ping")
  await composer.getByRole("button", { name: "Send" }).click()
  return chatRequestPromise
}
