import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eBrowserDiagnosticsInstall } from "../e2eBrowserDiagnosticsInstall.js"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"

export async function managedOriginDiagnosticsIngestionSetup(
  browser: Browser,
  runId: string,
  resources: { context?: BrowserContext; diagnostics?: ReturnType<typeof e2eBrowserDiagnosticsInstall> },
) {
  const marker = `e2e-browser-diagnostics-${runId}`
  const secret = `e2e-diagnostic-secret-${runId}`
  const failedPath = `/api/e2e-browser-diagnostics/${marker}`
  const routePattern = `**${failedPath}**`
  const issued = await e2eMemberSessionsIssue(runId)
  const [member] = issued.members
  const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const context = await browser.newContext({ baseURL: baseOrigin })
  resources.context = context
  await context.addCookies([
    {
      domain: new URL(baseOrigin).hostname,
      name: "__Host-codeline-session",
      path: "/",
      secure: true,
      value: member.token,
    },
  ])
  const page = await context.newPage()
  const diagnostics = e2eBrowserDiagnosticsInstall(page, test.info(), {
    expected: (event) => {
      if (event.kind === "console") {
        return event.level === "error" && (event.message.includes(marker) || event.url.includes(failedPath))
      }
      if (event.kind === "pageerror") return event.message.includes(marker)
      return event.url.includes(failedPath)
    },
  })
  resources.diagnostics = diagnostics
  await context.route(routePattern, async (route) => {
    await route.abort("failed")
  })
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()
  return { baseOrigin, context, diagnostics, failedPath, marker, member, page, routePattern, secret }
}
