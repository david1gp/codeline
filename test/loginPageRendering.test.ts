import { expect, test } from "bun:test"

test("login route renders a native document-navigation sign-in action", async () => {
  const loginPage = await Bun.file(new URL("../src/identity/ui/LoginPage.tsx", import.meta.url)).text()
  const loginPageState = await Bun.file(new URL("../src/identity/ui/loginPageStateCreate.ts", import.meta.url)).text()
  const applicationRoot = await Bun.file(new URL("../src/ui/ApplicationRoot.tsx", import.meta.url)).text()
  const applicationRootState = await Bun.file(
    new URL("../src/ui/applicationRootStateCreate.ts", import.meta.url),
  ).text()
  const router = await Bun.file(new URL("../src/ui/UiRouter.tsx", import.meta.url)).text()

  expect(router).toContain('<Route path="/login" component={LoginPage} />')
  expect(applicationRoot).toContain("href={session.loginHref()}")
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
