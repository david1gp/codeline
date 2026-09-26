import { type Browser, type BrowserContext } from "@playwright/test"

export async function chatCommandExpansionMemberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: "__Host-codeline-session", path: "/", secure: true, value: token },
  ])
  return context
}
