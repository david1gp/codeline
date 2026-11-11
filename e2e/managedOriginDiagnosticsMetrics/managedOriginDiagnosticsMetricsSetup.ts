import type { Browser } from "@playwright/test"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eOriginGet } from "../e2eOriginGet.js"

export async function managedOriginDiagnosticsMetricsSetup(browser: Browser, runId: string) {
  const issued = await e2eMemberSessionsIssue(runId)
  const [member] = issued.members
  const baseOrigin = e2eOriginGet()
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    {
      domain: new URL(baseOrigin).hostname,
      name: "__Host-codeline-session",
      path: "/",
      secure: true,
      value: member.token,
    },
  ])
  return { baseOrigin, context }
}
