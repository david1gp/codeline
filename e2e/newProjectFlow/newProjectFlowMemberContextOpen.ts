import { type Browser, type BrowserContext } from "@playwright/test"
import { e2eOriginGet } from "../e2eOriginGet.js"

export async function newProjectFlowMemberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const baseOrigin = e2eOriginGet()
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: "__Host-codeline-session", path: "/", secure: true, value: token },
  ])
  return context
}
