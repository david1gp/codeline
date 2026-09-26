import { type Page, expect } from "@playwright/test"

export async function lunaDelegationSubmit(page: Page, simulationSessionId: string): Promise<void> {
  const syncTimeout = 120_000
  await page.goto(
    simulationSessionId === "example-session-simulation-streaming"
      ? "/simulate/streaming"
      : `/sessions/${simulationSessionId}`,
  )
  await expect(page.getByRole("button", { name: "Stream view" })).toBeVisible({ timeout: syncTimeout })
  await page.getByRole("button", { name: "Stream view" }).click()
  const composer = page.getByRole("form", { name: "Chat composer" })
  await expect(composer).toBeVisible({ timeout: syncTimeout })
  const messageInput = composer.getByLabel("Message")
  await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
  await messageInput.fill("delegate:Return the deterministic child answer exactly once.")
  await composer.getByRole("button", { name: "Send" }).click()
}
