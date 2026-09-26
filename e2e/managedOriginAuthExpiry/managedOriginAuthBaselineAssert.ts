import { expect, type Page } from "@playwright/test"
import { managedOriginEventFeedStatusRead } from "./managedOriginEventFeedStatusRead.js"

export async function managedOriginAuthBaselineAssert(page: Page, settledSessionId: string | undefined) {
  // Authenticated baseline: the workspace renders the member's own data and
  // every mutation surface is live, so a later withdrawal is meaningful.
  await page.goto(`/sessions/${settledSessionId}`)
  const settledSessionTitle = "Build the workspace shell"
  await expect(page.getByText(settledSessionTitle, { exact: true }).first()).toBeVisible()
  await expect(
    page
      .getByRole("main")
      .getByRole("region", { name: "Activity", exact: true })
      .getByRole("list", { name: "Recent semantic activity", exact: true })
      .getByText("Create a focused workspace shell for local development.", { exact: true }),
  ).toBeVisible()
  await expect(page.locator("[data-session-read-only='true']")).toHaveCount(0)
  await expect(page.getByRole("button", { name: `Rename ${settledSessionTitle}` })).toBeVisible()
  await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled()

  // The feed is reachable while the identity session is valid.
  expect(await managedOriginEventFeedStatusRead(page)).toBe(200)
}
