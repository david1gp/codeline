import { expect, test } from "bun:test"

test("login route renders a native document-navigation sign-in action", async () => {
  const loginPage = await Bun.file(new URL("../src/identity/ui/LoginPage.tsx", import.meta.url)).text()
  const loginPageState = await Bun.file(new URL("../src/identity/ui/loginPageStateCreate.ts", import.meta.url)).text()
  const applicationRoot = await Bun.file(new URL("../src/ui/ApplicationRoot.tsx", import.meta.url)).text()
  const applicationRootState = await Bun.file(
    new URL("../src/ui/applicationRootStateCreate.ts", import.meta.url),
  ).text()
  const authRoutes = await Bun.file(new URL("../src/identity/auth_url/getRoutesAuth.ts", import.meta.url)).text()

  expect(authRoutes).toContain("pageNameAuth")
  expect(authRoutes).toContain("pageRouteAuth")
  expect(authRoutes).toContain("lazy")
  expect(authRoutes).toContain('import("../ui/LoginPage.js")')
  expect(applicationRoot).toContain("<LoginPage />")
  expect(applicationRoot).not.toContain("Sign in required")
  expect(applicationRootState).toContain("authReturnPathResolve")
  expect(applicationRootState).toContain("returnTo")
  expect(loginPage).toContain('from "#ui/interactive/link/LinkButton.jsx"')
  expect(loginPage).toContain("<LinkButtonExternal")
  expect(loginPage).toContain("<For each={state.providers()}>")
  expect(loginPage).not.toContain('from "@solidjs/router"')
  expect(loginPage).toContain("href={state.loginHref(provider.id)}")
  expect(loginPage).toContain('target="_self"')
  expect(loginPageState).toContain('fetcher("/api/auth/providers"')
  expect(loginPageState).toContain('cache: "no-store"')
  expect(loginPageState).toContain("returnTo")
  expect(loginPageState).toContain("providerId")
  expect(loginPage).toContain("Continue with {provider.label} SSO")
  expect(loginPage).not.toContain("Authworks")
  expect(loginPage).not.toContain("authworks.contentoren.de")
})

test("login page renders an empty state when the provider catalog is empty", async () => {
  const loginPage = await Bun.file(new URL("../src/identity/ui/LoginPage.tsx", import.meta.url)).text()

  expect(loginPage).toContain("when={state.providers().length > 0}")
  expect(loginPage).toContain("No sign-in providers are available.")
})
