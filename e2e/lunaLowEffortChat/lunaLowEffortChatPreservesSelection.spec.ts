import { type BrowserContext, test } from "@playwright/test"
import { e2eBrowserDiagnosticsInstall } from "../e2eBrowserDiagnosticsInstall.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { lunaLowEffortChatAction } from "./lunaLowEffortChatAction.js"
import { lunaLowEffortChatAssert } from "./lunaLowEffortChatAssert.js"
import { lunaLowEffortChatCleanup } from "./lunaLowEffortChatCleanup.js"
import { lunaLowEffortChatDiagnosticsInstall } from "./lunaLowEffortChatDiagnosticsInstall.js"
import { lunaLowEffortChatSetup } from "./lunaLowEffortChatSetup.js"

test("Luna low-effort chat preserves the selected execution and finalizes ping pong", async ({ browser }) => {
  test.setTimeout(180_000)
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let diagnostics: ReturnType<typeof e2eBrowserDiagnosticsInstall> | undefined
  let cleanupError: unknown
  try {
    const setup = await lunaLowEffortChatSetup(browser, runId)
    context = setup.context
    const { sessionId } = setup
    const page = await context.newPage()
    const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
    const paths = [
      `/api/sessions/${encodeURIComponent(sessionId)}/events`,
      `/api/sessions/${encodeURIComponent(sessionId)}/delegations`,
    ]
    diagnostics = e2eBrowserDiagnosticsInstall(page, test.info(), {
      // Initial delegations read is intentionally cancelled as the session finishes loading.
      expected: (event) =>
        event.kind === "requestfailed" &&
        event.method === "GET" &&
        event.errorText === "net::ERR_ABORTED" &&
        (() => {
          try {
            const url = new URL(event.url)
            return url.origin === new URL(baseOrigin).origin && paths.includes(url.pathname)
          } catch (_error) {
            return false
          }
        })(),
    })
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)
    const chatRequest = await lunaLowEffortChatAction(page, sessionId)
    await lunaLowEffortChatAssert(page, sessionId, chatRequest)
  } finally {
    try {
      await lunaLowEffortChatCleanup(runId, context, diagnostics)
    } catch (error) {
      cleanupError = error
    }
  }
  if (cleanupError !== undefined) throw cleanupError
})
