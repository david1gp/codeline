import { expect, type Page } from "@playwright/test"

export async function lunaPingPongAssert(page: Page): Promise<void> {
  const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
  await expect(
    page.getByRole("region", { name: "Latest agent answer", exact: true }).getByText("pong", { exact: true }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(recentActivity.getByText("ping", { exact: true })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("No recent activity yet.", { exact: true })).toHaveCount(0, { timeout: 30_000 })
}
