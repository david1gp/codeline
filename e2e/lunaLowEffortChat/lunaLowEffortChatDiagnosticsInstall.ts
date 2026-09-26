import { type Page, type TestInfo } from "@playwright/test"
import { e2eBrowserDiagnosticsInstall } from "../e2eBrowserDiagnosticsInstall.js"

export function lunaLowEffortChatDiagnosticsInstall(page: Page, info: TestInfo, sessionId: string) {
  const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const sessionDetailEventsPath = `/api/sessions/${encodeURIComponent(sessionId)}/events`
  const delegationsPath = `/api/sessions/${encodeURIComponent(sessionId)}/delegations`
  return e2eBrowserDiagnosticsInstall(page, info, {
    // The session view cancels its initial delegations read when the selected
    // session finishes loading; that intentional fetch abort is not a browser error.
    expected: (event) =>
      event.kind === "requestfailed" &&
      event.method === "GET" &&
      event.errorText === "net::ERR_ABORTED" &&
      (() => {
        try {
          const url = new URL(event.url)
          return (
            url.origin === new URL(baseOrigin).origin &&
            (url.pathname === sessionDetailEventsPath || url.pathname === delegationsPath)
          )
        } catch (_error) {
          return false
        }
      })(),
  })
}
