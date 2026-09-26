import { type BrowserContext, expect } from "@playwright/test"

export async function newProjectFlowFirstMessageAction(context: BrowserContext, agentId: string, runId: string) {
  const syncTimeout = 45_000
  const page = await context.newPage()
  await page.goto("/sessions?tab=projects")
  await page.getByRole("button", { name: "New Session", exact: true }).click()
  await expect(page).toHaveURL(/\/sessions\/new\?tab=projects$/)
  const projectSelector = page.locator("#workspace-setup-project")
  await projectSelector.getByRole("button", { name: /^Project:/ }).click()
  const projectOption = page.getByRole("option", { name: "codeline", exact: true })
  await expect(projectOption).toBeVisible({ timeout: syncTimeout })
  await projectOption.click()
  const agentSelector = page.getByLabel("Agent for a new session")
  await expect(agentSelector).toBeEnabled({ timeout: syncTimeout })
  await agentSelector.selectOption(agentId)
  await expect(agentSelector).toHaveValue(agentId)
  const prompt = `first project message ${runId}`
  const composer = page.getByRole("form", { name: "Chat composer" })
  await composer.getByLabel("Message").fill(prompt)
  await composer.getByRole("button", { name: "Send", exact: true }).click()
  await expect(page).toHaveURL(/\/sessions\/(?!new(?:[/?]|$))[^/?]+(?:\?tab=projects)?$/, { timeout: syncTimeout })
  const sessionId = new URL(page.url()).pathname.split("/").at(-1)
  if (sessionId === undefined || sessionId.length === 0) throw new Error("The created session URL has no session id.")
  return { page, sessionId, prompt }
}
