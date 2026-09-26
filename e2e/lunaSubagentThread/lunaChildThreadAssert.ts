import { type Page, expect } from "@playwright/test"

export async function lunaChildThreadAssert(page: Page, childRunId: string): Promise<void> {
  const syncTimeout = 120_000
  await page.getByRole("button", { name: "Conversation view" }).click()
  const semanticActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
  const delegationToolRow = semanticActivity.locator(
    `li[data-session-semantic-kind="tool"]:has(button[data-child-run-id="${childRunId}"])`,
  )
  await expect(delegationToolRow).toHaveCount(1, { timeout: syncTimeout })
  const childButton = delegationToolRow.getByRole("button", { name: "Open child conversation", exact: true })
  await expect(childButton).toHaveCount(1, { timeout: syncTimeout })
  await expect(childButton).toBeVisible({ timeout: syncTimeout })
  await expect(childButton).toHaveAccessibleName("Open child conversation")
  await expect(childButton).toHaveAttribute("data-child-run-id", childRunId)
  await childButton.click()
  const panel = page.locator("#workspace-right-panel")
  await expect(panel).toBeVisible({ timeout: syncTimeout })
  await expect(panel).toHaveAccessibleName("Subagent thread")
  await expect(panel.getByText("Subagent thread", { exact: true })).toBeVisible()
  await expect(
    panel.getByText("The deterministic workspace check is streaming. No provider connection is required.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: syncTimeout })
  const childStream = panel.getByRole("region", { name: "Subagent execution stream" })
  await expect(childStream).toBeVisible()
  await expect(childStream).toContainText("No live child stream is available.")
  const latestAnswer = page.getByRole("region", { name: "Response", exact: true })
  await expect(latestAnswer).toHaveCount(1, { timeout: syncTimeout })
  await expect(latestAnswer.locator(".markdown-content--message")).toHaveText(/^ok$/, { timeout: syncTimeout })
}
