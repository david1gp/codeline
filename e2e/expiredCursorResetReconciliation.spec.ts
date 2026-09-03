import { type APIRequestContext, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { sessionCacheDatabaseConfig } from "../src/session/storage/sessionCacheDatabaseConfig.js"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eJournalEventsPrune } from "./e2eJournalEventsPrune.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const cachedSessionId = "example-session-active-1"
const cachedSessionTitle = "Build the workspace shell"

type FeedRequest = { after: string | null; status?: number }

type HttpRequest = {
  method: string
  path: string
  requestOrder: number
  status?: number
  finishedOrder?: number
}

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

/** Reads the bounded device-local snapshot records the application itself wrote. */
async function sessionSnapshotRecordsRead(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async (name) => {
    const opened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!opened.objectStoreNames.contains("sessionSnapshots")) return []
      const store = opened.transaction("sessionSnapshots", "readonly").objectStore("sessionSnapshots")
      const records = await new Promise<unknown[]>((resolve, reject) => {
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result as unknown[])
        request.onerror = () => reject(request.error)
      })
      return records as Array<Record<string, unknown>>
    } finally {
      opened.close()
    }
  }, sessionCacheDatabaseConfig.name)
}

async function selectedEventSourceClosedUrlsRead(page: Page, sessionId: string): Promise<string[]> {
  const path = `/api/sessions/${sessionId}/events`
  return page.evaluate((selectedPath) => {
    return (window.__codelineEventFeedClosedUrls ?? [])
      .map((url) => new URL(url, window.location.origin))
      .filter((url) => url.pathname === selectedPath)
      .map((url) => url.href)
  }, path)
}

async function selectedEventSourceLiveUrlsRead(page: Page, sessionId: string): Promise<string[]> {
  const path = `/api/sessions/${sessionId}/events`
  return page.evaluate((selectedPath) => {
    const normalize = (url: string) => new URL(url, window.location.origin)
    const created = (window.__codelineEventFeedUrls ?? [])
      .map(normalize)
      .filter((url) => url.pathname === selectedPath)
      .map((url) => url.href)
    const closedCounts = new Map<string, number>()
    for (const rawUrl of window.__codelineEventFeedClosedUrls ?? []) {
      const url = normalize(rawUrl)
      if (url.pathname !== selectedPath) continue
      closedCounts.set(url.href, (closedCounts.get(url.href) ?? 0) + 1)
    }
    const live: string[] = []
    for (const url of created) {
      const closedCount = closedCounts.get(url) ?? 0
      if (closedCount > 0) {
        closedCounts.set(url, closedCount - 1)
        continue
      }
      live.push(url)
    }
    return live
  }, path)
}

async function globalEventSourceClosedCountRead(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window.__codelineEventFeedClosedUrls ?? []).filter(
        (url) => new URL(url, window.location.origin).pathname === "/api/events",
      ).length,
  )
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
    const httpRequests: HttpRequest[] = []
    const trackedFeedRequests = new WeakMap<object, FeedRequest>()
    const trackedHttpRequests = new WeakMap<object, HttpRequest>()
    let requestOrder = 0
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.origin !== baseOrigin || !url.pathname.startsWith("/api/")) return
      if (url.pathname === "/api/events") {
        const tracked: FeedRequest = { after: url.searchParams.get("after") }
        feedRequests.push(tracked)
        trackedFeedRequests.set(request, tracked)
        return
      }
      const tracked: HttpRequest = {
        method: request.method(),
        path: `${url.pathname}${url.search}`,
        requestOrder: ++requestOrder,
      }
      httpRequests.push(tracked)
      trackedHttpRequests.set(request, tracked)
    })
    page.on("response", (response) => {
      const trackedFeed = trackedFeedRequests.get(response.request())
      if (trackedFeed !== undefined) trackedFeed.status = response.status()
      const tracked = trackedHttpRequests.get(response.request())
      if (tracked !== undefined) tracked.status = response.status()
    })
    page.on("requestfinished", (request) => {
      const tracked = trackedHttpRequests.get(request)
      if (tracked !== undefined) tracked.finishedOrder = ++requestOrder
    })

    await page.goto(`/sessions/${cachedSessionId}`)
    await expect(page.getByText(cachedSessionTitle).first()).toBeVisible()

    // The device-local record is written purely through public behavior.
    await expect
      .poll(async () => (await sessionSnapshotRecordsRead(page)).length, { timeout: 15_000 })
      .toBeGreaterThan(0)
    const recordsBefore = await sessionSnapshotRecordsRead(page)
    const cachedBefore = recordsBefore.find((record) => record.sessionId === cachedSessionId)
    expect(cachedBefore).toBeDefined()

    // The tab opens exactly one feed, and it bootstraps fresh without a cursor.
    await expect.poll(() => feedRequests.length, { timeout: 15_000 }).toBe(1)
    expect(feedRequests[0]?.after).toBeNull()
    await expect
      .poll(async () => (await selectedEventSourceLiveUrlsRead(page, cachedSessionId)).length, { timeout: 15_000 })
      .toBe(1)
    const initialSelectedSource = (await selectedEventSourceLiveUrlsRead(page, cachedSessionId))[0]
    if (initialSelectedSource === undefined) throw new Error("The selected-session stream did not attach.")
    const initialSelectedSourceUrl = new URL(initialSelectedSource, baseOrigin)
    const retainedSelectedCursor = initialSelectedSourceUrl.searchParams.get("after")
    if (retainedSelectedCursor === null) throw new Error("The selected-session stream did not retain a cursor.")

    // One live invalidation moves the tab's in-memory cursor onto a real
    // journal sequence, which is the cursor the server later cannot recover.
    const attachedTitle = `${cachedSessionTitle} ${runId} attached`
    await sessionRename(api, attachedTitle)
    await expect(page.getByText(attachedTitle).first()).toBeVisible({ timeout: 30_000 })

    // While the tab is disconnected the journal advances and is then expired
    // through the repository-owned retention action, so the tab's cursor falls
    // behind the durable replay boundary.
    await context.setOffline(true)
    await expect.poll(() => globalEventSourceClosedCountRead(page), { timeout: 15_000 }).toBe(1)
    await expect
      .poll(async () => (await selectedEventSourceClosedUrlsRead(page, cachedSessionId)).length, { timeout: 15_000 })
      .toBe(1)
    expect(await selectedEventSourceClosedUrlsRead(page, cachedSessionId)).toContain(initialSelectedSourceUrl.href)
    const expiredTitle = `${cachedSessionTitle} ${runId} expired`
    await sessionRename(api, `${cachedSessionTitle} ${runId} gap`)
    await sessionRename(api, expiredTitle)
    const pruned = await e2eJournalEventsPrune(runId)
    const memberPrune = pruned.find((entry) => entry.userId === member.userId)
    expect(memberPrune?.prunedEventCount ?? 0).toBeGreaterThan(0)
    expect(memberPrune?.prunedThroughSequence ?? 0).toBeGreaterThan(0)
    const postResetTitle = `${cachedSessionTitle} ${runId} postReset`
    await sessionRename(api, postResetTitle)

    const reconnectIndex = feedRequests.length
    const reconciliationStart = httpRequests.length
    await context.setOffline(false)

    // The retained cursor first receives the server's reset. Only after
    // reconciliation does a fresh feed attach at the new authoritative cursor.
    const recoveryFeedRequests = () => feedRequests.slice(reconnectIndex)
    await expect
      .poll(
        () => {
          const [reset, fresh] = recoveryFeedRequests()
          return (
            reset?.status === 400 &&
            typeof reset.after === "string" &&
            typeof fresh?.after === "string" &&
            reset.after !== fresh.after
          )
        },
        { timeout: 60_000 },
      )
      .toBe(true)
    const resetAttach = recoveryFeedRequests()[0]
    const freshAttach = recoveryFeedRequests()[1]
    expect(resetAttach?.status).toBe(400)
    expect(resetAttach?.after).toEqual(expect.any(String))
    expect(freshAttach?.after).toEqual(expect.any(String))
    expect(freshAttach?.after).not.toBe(resetAttach?.after)

    const reconciliation = () => httpRequests.slice(reconciliationStart)
    const selectedSessionPath = `/api/sessions/${cachedSessionId}`
    const selectedSnapshotPath = `${selectedSessionPath}/bounded-snapshot`
    // Reset reconciliation must obtain a shell/list snapshot before the
    // selected stream attaches with its fresh opaque cursor.
    await expect
      .poll(
        () =>
          reconciliation().some(
            (entry) =>
              entry.method === "GET" &&
              entry.path.startsWith("/api/sessions?") &&
              entry.status !== undefined &&
              entry.finishedOrder !== undefined,
          ),
        { timeout: 60_000 },
      )
      .toBe(true)
    const listResponse = reconciliation().find(
      (entry) =>
        entry.method === "GET" &&
        entry.path.startsWith("/api/sessions?") &&
        entry.status !== undefined &&
        entry.finishedOrder !== undefined,
    )
    expect(listResponse).toBeDefined()
    expect([200, 304]).toContain(listResponse?.status)

    await expect
      .poll(
        () =>
          reconciliation().some(
            (entry) =>
              entry.method === "GET" &&
              entry.path === selectedSnapshotPath &&
              entry.status !== undefined &&
              entry.finishedOrder !== undefined,
          ),
        { timeout: 60_000 },
      )
      .toBe(true)
    const selectedSnapshotRequest = reconciliation().find(
      (entry) =>
        entry.method === "GET" &&
        entry.path === selectedSnapshotPath &&
        entry.status !== undefined &&
        entry.finishedOrder !== undefined,
    )
    expect(selectedSnapshotRequest).toBeDefined()
    if (selectedSnapshotRequest === undefined || selectedSnapshotRequest.finishedOrder === undefined)
      throw new Error("The selected-session snapshot request did not complete.")
    expect(selectedSnapshotRequest.status).toBe(200)

    // Reconciliation catches the tab up to the state it missed while expired.
    await expect(page.getByText(postResetTitle).first()).toBeVisible({ timeout: 60_000 })

    await expect
      .poll(
        async () => {
          const sources = await selectedEventSourceLiveUrlsRead(page, cachedSessionId)
          return sources.length
        },
        { timeout: 60_000 },
      )
      .toBe(1)
    const currentSelectedSource = (await selectedEventSourceLiveUrlsRead(page, cachedSessionId))[0]
    if (currentSelectedSource === undefined) throw new Error("The selected-session stream did not remain attached.")
    const selectedClosedAfterSnapshot = (await selectedEventSourceClosedUrlsRead(page, cachedSessionId)).length
    const currentSelectedSourceUrl = new URL(currentSelectedSource, baseOrigin)
    const freshSelectedRequest = reconciliation().find(
      (entry) =>
        entry.method === "GET" &&
        entry.path === `${currentSelectedSourceUrl.pathname}${currentSelectedSourceUrl.search}`,
    )
    expect(freshSelectedRequest).toBeDefined()
    if (freshSelectedRequest === undefined)
      throw new Error("The fresh selected-session stream request was not tracked.")
    const freshSelectedCursor = new URL(freshSelectedRequest.path, baseOrigin).searchParams.get("after")
    expect(freshSelectedCursor).not.toBeNull()
    expect(freshSelectedCursor).not.toBe(retainedSelectedCursor)
    expect(selectedSnapshotRequest.finishedOrder).toBeLessThan(freshSelectedRequest.requestOrder)

    // An expired replay cursor never discards durable device-local data.
    const recordsAfter = await sessionSnapshotRecordsRead(page)
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
    expect(await selectedEventSourceClosedUrlsRead(page, cachedSessionId)).toHaveLength(selectedClosedAfterSnapshot)
    expect(await selectedEventSourceLiveUrlsRead(page, cachedSessionId)).toEqual([currentSelectedSource])

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
