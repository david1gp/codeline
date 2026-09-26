import { expect, type Page, test } from "@playwright/test"

type SsoProvider = "Authworks" | "Zitadel"

async function managedOriginSsoSignIn(page: Page, provider: SsoProvider): Promise<void> {
  const emailEnvironmentKey = provider === "Authworks" ? "E2E_STAFF_EMAIL" : "E2E_ZITADEL_STAFF_EMAIL"
  const passwordEnvironmentKey = provider === "Authworks" ? "E2E_STAFF_PASSWORD" : "E2E_ZITADEL_STAFF_PASSWORD"
  const email = process.env[emailEnvironmentKey]
  const password = process.env[passwordEnvironmentKey]
  if (!email || !password) throw new Error(`Missing required ${provider} E2E credentials in the ignored .env.`)

  await page.goto("/login")
  await expect(page.getByRole("heading", { name: "Sign in to Codeline" })).toBeVisible()
  await page.getByRole("link", { name: `Continue with ${provider} SSO` }).click()

  if (provider === "Authworks") {
    await page.getByRole("button", { name: "Password" }).click()
    await page.getByRole("textbox", { name: "Username or email" }).fill(email)
    await page.getByRole("textbox", { name: "Password" }).fill(password)
    await page.getByRole("button", { name: "Sign in" }).click()
    return
  }

  await page.getByRole("textbox", { name: "Loginname" }).fill(email)
  await page.getByRole("button", { name: "Continue" }).click()
  await page.getByRole("textbox", { name: "Password" }).fill(password)
  await page.getByRole("button", { name: "Continue" }).click()
}

for (const provider of ["Authworks", "Zitadel"] as const) {
  test(`${provider} SSO signs in to the managed dashboard and signs out`, async ({ browser }) => {
    test.setTimeout(120_000)
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await managedOriginSsoSignIn(page, provider)
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Account" })).toBeVisible()
      await page.getByRole("button", { name: "Account" }).click()
      await page.getByRole("button", { name: "Sign out" }).click()
      await expect(page.getByRole("heading", { name: "Sign in to Codeline" })).toBeVisible()
    } finally {
      await context.close()
    }
  })
}
