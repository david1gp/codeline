import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eBrowserDiagnosticsInstall } from "./e2eBrowserDiagnosticsInstall.js"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eManagedApiJournalRead } from "./e2eManagedApiJournalRead.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

function journalEntryIsObject(entry: unknown): entry is Record<string, unknown> {
  return typeof entry === "object" && entry !== null
}

test("the managed preview ingests sanitized browser diagnostics in the API journal", async ({ browser }) => {
  test.setTimeout(120_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  const testStartedAt = new Date(Date.now() - 1_000)
  const marker = `e2e-browser-diagnostics-${runId}`
  const secret = `e2e-diagnostic-secret-${runId}`
  const failedPath = `/api/e2e-browser-diagnostics/${marker}`
  const routePattern = `**${failedPath}**`
  let context: BrowserContext | undefined
  let diagnostics: ReturnType<typeof e2eBrowserDiagnosticsInstall> | undefined
  let cleanupError: unknown
  let diagnosticsError: unknown
  let deletedUserIds: string[] = []

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })
    context = await memberContextOpen(browser, member.token)

    const page = await context.newPage()
    diagnostics = e2eBrowserDiagnosticsInstall(page, test.info(), {
      expected: (event) => {
        if (event.kind === "console") {
          return event.level === "error" && (event.message.includes(marker) || event.url.includes(failedPath))
        }
        if (event.kind === "pageerror") return event.message.includes(marker)
        return event.url.includes(failedPath)
      },
    })

    await context.route(routePattern, async (route) => {
      await route.abort("failed")
    })
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible()

    const pageErrorPromise = page.waitForEvent("pageerror", {
      predicate: (error) => error.message.includes(marker),
    })
    const requestFailedPromise = page.waitForEvent("requestfailed", {
      predicate: (request) => request.url().includes(failedPath),
    })
    const ingestionRequestPromise = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith("/api/diagnostics/logs"),
    )

    await page.evaluate(
      ({ failedUrl, marker, secret }) => {
        console.error(`${marker} console ${failedUrl} Bearer ${secret}`, {
          authorization: `Bearer ${secret}`,
          body: secret,
          url: `${failedUrl}#diagnostic-fragment`,
        })
        setTimeout(() => {
          throw new Error(`${marker} page error`)
        }, 0)
        void fetch(failedUrl).catch(() => undefined)
      },
      { failedUrl: `${baseOrigin}${failedPath}?token=${secret}`, marker, secret },
    )

    await Promise.all([pageErrorPromise, requestFailedPromise])
    const ingestionRequest = await ingestionRequestPromise
    expect(ingestionRequest.method()).toBe("POST")

    await expect
      .poll(
        async () => {
          const entries = await e2eManagedApiJournalRead(testStartedAt)
          return entries.filter((entry) => journalEntryIsObject(entry) && JSON.stringify(entry).includes(marker))
        },
        { intervals: [250, 500, 1_000, 2_000], timeout: 15_000 },
      )
      .toHaveLength(3)

    const journalEntries = (await e2eManagedApiJournalRead(testStartedAt)).filter(
      (entry): entry is Record<string, unknown> =>
        journalEntryIsObject(entry) && JSON.stringify(entry).includes(marker),
    )
    expect(journalEntries.every((entry) => entry.eventType === "client-log")).toBe(true)
    expect(journalEntries.every((entry) => entry.userId === member.userId)).toBe(true)
    expect(journalEntries.map((entry) => entry.source)).toEqual(expect.arrayContaining(["console.error", "fetch"]))

    const serializedJournal = JSON.stringify(journalEntries)
    expect(serializedJournal).toContain(failedPath)
    expect(serializedJournal).toContain("[REDACTED]")
    expect(serializedJournal).not.toContain(secret)
    expect(serializedJournal).not.toContain("diagnostic-fragment")
    expect(serializedJournal).not.toContain(`?token=`)

    await context.unroute(routePattern)
  } finally {
    try {
      await diagnostics?.finalize()
    } catch (error) {
      diagnosticsError = error
    }
    try {
      await context?.close()
    } catch (error) {
      cleanupError = error
    }
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
      await e2eExampleDataSeedRestore()
    } catch (error) {
      cleanupError = error
    }
  }

  if (diagnosticsError !== undefined) throw diagnosticsError
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
