import { type BrowserContext, expect } from "@playwright/test"
import type { E2eExampleDataMapping } from "../e2eExampleDataSeedForMember.js"

export async function pinnedSessionsLandingAssert(
  context: BrowserContext,
  mapping: E2eExampleDataMapping,
): Promise<void> {
  const page = await context.newPage()
  await page.goto("/sessions?tab=pinned")
  await expect(page).toHaveURL(/\/sessions\?tab=pinned$/)
  await expect(page.getByRole("tab", { name: "Pinned" })).toHaveAttribute("aria-selected", "true")
  const conversations = page.getByRole("list", { name: "Active conversations" })
  await expect(conversations.getByText("Build the workspace shell")).toBeVisible()
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const pinned = await context.request.get(`${origin}/api/sessions/${mapping["session:example-session-active-1"]}`)
  expect(pinned.ok(), await pinned.text()).toBe(true)
  expect((await pinned.json()) as { session: { id: string } }).toMatchObject({
    session: { id: mapping["session:example-session-active-1"] },
  })
  await expect(page.getByText("The requested project was not found.", { exact: true })).toHaveCount(0)
  await page.close()
}
