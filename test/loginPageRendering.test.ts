import { expect, test } from "bun:test"

test("login route renders a native document-navigation sign-in action", async () => {
  const loginPage = await Bun.file(new URL("../src/identity/ui/LoginPage.tsx", import.meta.url)).text()
  const applicationRoot = await Bun.file(new URL("../src/ui/ApplicationRoot.tsx", import.meta.url)).text()
  const router = await Bun.file(new URL("../src/ui/UiRouter.tsx", import.meta.url)).text()

  expect(router).toContain('<Route path="/login" component={LoginPage} />')
  expect(applicationRoot).toContain('href="/api/auth/login"')
  expect(applicationRoot).not.toContain('href="/login"')
  expect(loginPage).toContain("<a")
  expect(loginPage).not.toContain('from "@solidjs/router"')
  expect(loginPage).toContain("href={state.loginHref()}")
  expect(loginPage).toContain('target="_self"')
})
