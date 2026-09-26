import { expect, type Page } from "@playwright/test"

export async function managedOriginAuthExpiryAssert(page: Page) {
  await expect(page.locator("[data-session-read-only='true']")).toHaveText(/Signed out\./, { timeout: 30_000 })

  // Signed out withdraws every authenticated surface. The cached settled
  // transcript stays readable, which is the documented signed-out behavior.
  const composer = page.getByRole("textbox", { name: "Message" })
  await expect(composer).toBeDisabled()
  await expect(composer).toHaveAttribute("placeholder", "Read-only. Sending is unavailable.")
  await expect(page.getByRole("button", { name: "Rename Build the workspace shell" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Pin session" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Unpin session" })).toHaveCount(0)

  // No authenticated shell survives anywhere: an account-agnostic route falls
  // back to the provider selection page rather than any retained identity.
  await page.goto("/")
  const login = page.getByRole("main")
  await expect(login.getByRole("heading", { name: "Sign in to Codeline", exact: true })).toBeVisible()
  await expect(login.getByRole("link", { name: "Continue with Authworks SSO", exact: true })).toBeVisible()
  await expect(login.getByRole("link", { name: "Continue with Zitadel SSO", exact: true })).toBeVisible()
  await expect(login.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(0)
  await page.close()
}
