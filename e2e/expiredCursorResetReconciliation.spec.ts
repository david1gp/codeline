import { type APIRequestContext, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eJournalEventsPrune } from "./e2eJournalEventsPrune.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const settledDatabaseName = "codeline-settled-sessions"
const cachedSessionId = "example-session-active-1"
const cachedSessionTitle = "Build the workspace shell"

type FeedRequest = { after: string | null; index: number }

declare global {
  interface Window {
    __codelineEventFeedClosedUrls?: string[]
    __codelineEventFeedUrls?: string[]
  }
}

function sessionCookie(token: string) {
  return { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token }
}

/** Renames the session over typed HTTP with the current strong ETag precondition. */
async function sessionRename(api: APIRequestContext, title: string): Promise<void> {
  const shell = await api.get(`${baseOrigin}/api/sessions/${cachedSessionId}`)
  expect(shell.status()).toBe(200)
  const etag = shell.headers().etag ?? ""
  expect(etag.length).toBeGreaterThan(0)

  const renamed = await api.patch(`${baseOrigin}/api/sessions/${cachedSessionId}`, {
    data: { title },
    // Mutations are same-origin only; the guard rejects a missing Origin.
    headers: { "Content-Type": "application/json", "If-Match": etag, Origin: baseOrigin },
  })
  expect(renamed.status(), await renamed.text()).toBe(200)
}

/** Reads the device-local settled records the application itself wrote. */
async function settledRecordsRead(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async (name) => {
    const opened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!opened.objectStoreNames.contains("settledSessions")) return []
      const store = opened.transaction("settledSessions", "readonly").objectStore("settledSessions")
      const records = await new Promise<unknown[]>((resolve, reject) => {
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result as unknown[])
        request.onerror = () => reject(request.error)
      })
      return records as Array<Record<string, unknown>>
    } finally {
      opened.close()
    }
  }, settledDatabaseName)
}

test("an expired SSE cursor resets the feed and reconciles without discarding cached sessions", async ({ browser }) => {
  // A full reconciliation cycle plus deterministic re-seeding exceeds the default budget.
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })

    const context = await browser.newContext({ baseURL: baseOrigin })
    contexts.push(context)
    await context.addCookies([sessionCookie(member.token)])
    await context.addInitScript(() => {
      const native = window.EventSource
      const created: string[] = []
      const closed: string[] = []
      window.__codelineEventFeedUrls = created
      window.__codelineEventFeedClosedUrls = closed
      class TrackedEventSource extends native {
        constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
          super(url, eventSourceInitDict)
          created.push(String(url))
        }

        close() {
          closed.push(this.url)
          super.close()
        }
      }
      window.EventSource = TrackedEventSource
    })
    // A second context issues the mutations, so they keep working while the
    // browsing context is offline.
    const mutationContext = await browser.newContext({ baseURL: baseOrigin })
    contexts.push(mutationContext)
    await mutationContext.addCookies([sessionCookie(member.token)])
    const api = mutationContext.request

    const page = await context.newPage()
    const feedRequests: FeedRequest[] = []
    const httpRequests: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.origin !== baseOrigin || !url.pathname.startsWith("/api/")) return
      if (url.pathname === "/api/events") {
        feedRequests.push({ after: url.searchParams.get("after"), index: httpRequests.length })
        return
      }
      httpRequests.push(`${request.method()} ${url.pathname}${url.search}`)
    })

    await page.goto(`/sessions/${cachedSessionId}`)
    await expect(page.getByText(cachedSessionTitle).first()).toBeVisible()

    // The device-local record is written purely through public behavior.
    await expect.poll(async () => (await settledRecordsRead(page)).length, { timeout: 15_000 }).toBeGreaterThan(0)
    const recordsBefore = await settledRecordsRead(page)
    const cachedBefore = recordsBefore.find((record) => record.sessionId === cachedSessionId)
    expect(cachedBefore).toBeDefined()

    // The tab opens exactly one feed, and it bootstraps fresh without a cursor.
    await expect.poll(() => feedRequests.length, { timeout: 15_000 }).toBe(1)
    expect(feedRequests[0]?.after).toBeNull()

    // One live invalidation moves the tab's in-memory cursor onto a real
    // journal sequence, which is the cursor the server later cannot recover.
    const attachedTitle = `${cachedSessionTitle} ${runId} attached`
    await sessionRename(api, attachedTitle)
    await expect(page.getByText(attachedTitle).first()).toBeVisible({ timeout: 30_000 })

    // While the tab is disconnected the journal advances and is then expired
    // through the repository-owned retention action, so the tab's cursor falls
    // behind the durable replay boundary.
    await context.setOffline(true)
    await expect
      .poll(() => page.evaluate(() => window.__codelineEventFeedClosedUrls?.length ?? 0), { timeout: 15_000 })
      .toBe(1)
    const expiredTitle = `${cachedSessionTitle} ${runId} expired`
    await sessionRename(api, `${cachedSessionTitle} ${runId} gap`)
    await sessionRename(api, expiredTitle)
    const pruned = await e2eJournalEventsPrune(runId)
    const memberPrune = pruned.find((entry) => entry.userId === member.userId)
    expect(memberPrune?.prunedEventCount ?? 0).toBeGreaterThan(0)
    expect(memberPrune?.prunedThroughSequence ?? 0).toBeGreaterThan(0)

    const reconnectIndex = feedRequests.length
    const reconciliationStart = httpRequests.length
    await context.setOffline(false)

    // The retained cursor first receives the server's reset. Only after
    // reconciliation does a fresh feed attach at the new authoritative cursor.
    await expect.poll(() => feedRequests.length, { timeout: 60_000 }).toBeGreaterThanOrEqual(reconnectIndex + 2)
    const resetAttach = feedRequests[reconnectIndex]
    const freshAttach = feedRequests[reconnectIndex + 1]
    expect(resetAttach?.after).toEqual(expect.any(String))
    expect(freshAttach?.after).toEqual(expect.any(String))
    expect(freshAttach?.after).not.toBe(resetAttach?.after)

    const reconciliation = () => httpRequests.slice(reconciliationStart)
    // A consistent shell/list snapshot supplies the new `asOfSequence`.
    await expect
      .poll(() => reconciliation().some((entry) => entry.startsWith("GET /api/sessions?")), { timeout: 60_000 })
      .toBe(true)
    // The visible session and its messages are revalidated over HTTP.
    await expect
      .poll(() => reconciliation().some((entry) => entry === `GET /api/sessions/${cachedSessionId}`), {
        timeout: 60_000,
      })
      .toBe(true)
    await expect
      .poll(() => reconciliation().some((entry) => entry.startsWith(`GET /api/sessions/${cachedSessionId}/messages`)), {
        timeout: 60_000,
      })
      .toBe(true)

    // Reconciliation catches the tab up to the state it missed while expired.
    await expect(page.getByText(expiredTitle).first()).toBeVisible({ timeout: 60_000 })

    // An expired replay cursor never discards durable device-local data.
    const recordsAfter = await settledRecordsRead(page)
    expect(recordsAfter.some((record) => record.sessionId === cachedSessionId)).toBe(true)
    expect(recordsAfter.length).toBeGreaterThanOrEqual(recordsBefore.length)
    const recordKeysBefore = recordsBefore.map((record) => `${String(record.userId)}:${String(record.sessionId)}`)
    const recordKeysAfter = new Set(
      recordsAfter.map((record) => `${String(record.userId)}:${String(record.sessionId)}`),
    )
    for (const recordKey of recordKeysBefore) expect(recordKeysAfter.has(recordKey)).toBe(true)

    // The tab keeps exactly one feed after reconciliation.
    const finalFeed = feedRequests.length
    await page.waitForTimeout(2_000)
    expect(feedRequests.length).toBe(finalFeed)

    await page.close()
  } finally {
    for (const context of contexts) await context.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
      await e2eExampleDataSeedRestore()
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
