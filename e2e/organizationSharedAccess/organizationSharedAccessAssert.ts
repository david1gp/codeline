import { type BrowserContext, expect } from "@playwright/test"

export async function organizationSharedAccessAssert(
  contextOne: BrowserContext,
  contextTwo: BrowserContext,
  data: { createdSessionId: string; privateTitle: string; sharedTitle: string },
): Promise<void> {
  const pageOne = await contextOne.newPage()
  await pageOne.goto("/sessions?tab=recent")
  const conversationsOne = pageOne.getByRole("list", { name: "Active conversations" })
  await expect(conversationsOne.getByText(data.privateTitle)).toBeVisible()

  // Render the second member's list before checking that the first session is absent.
  const pageTwo = await contextTwo.newPage()
  await pageTwo.goto("/sessions?tab=recent")
  await expect(pageTwo.getByLabel("Agent for a new session")).toBeEnabled()
  const conversationsTwo = pageTwo.getByRole("list", { name: "Active conversations" })
  await expect(conversationsTwo.getByText(data.sharedTitle)).toBeVisible()
  await expect(conversationsTwo.getByText(data.privateTitle)).toHaveCount(0)

  const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const foreignSession = await contextTwo.request.get(`${baseOrigin}/api/sessions/${data.createdSessionId}`)
  expect(foreignSession.status()).toBe(404)
}
