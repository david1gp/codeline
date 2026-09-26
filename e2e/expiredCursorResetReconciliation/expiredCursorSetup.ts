import type { Browser, BrowserContext } from "@playwright/test"
import { e2eExampleDataSeedForMember } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"

declare global {
  interface Window {
    __codelineEventFeedClosedUrls?: string[]
    __codelineEventFeedUrls?: string[]
  }
}

export async function expiredCursorSetup(browser: Browser, runId: string, contexts: BrowserContext[]) {
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const issued = await e2eMemberSessionsIssue(runId)
  const [member] = issued.members
  const mapping = await e2eExampleDataSeedForMember({
    subject: `${issued.subjectPrefix}1`,
    userId: member.userId,
    runId,
  })
  const cachedSessionId = mapping["session:example-session-active-1"]!
  const cookie = {
    domain: new URL(origin).hostname,
    name: "__Host-codeline-session",
    path: "/",
    secure: true,
    value: member.token,
  }
  const context = await browser.newContext({ baseURL: origin })
  contexts.push(context)
  await context.addCookies([cookie])
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
  // Mutations use a second context while the browsing tab is offline.
  const mutationContext = await browser.newContext({ baseURL: origin })
  contexts.push(mutationContext)
  await mutationContext.addCookies([cookie])
  const page = await context.newPage()
  const feedRequests: Array<{ after: string | null; status?: number }> = []
  const httpRequests: Array<{
    method: string
    path: string
    requestOrder: number
    status?: number
    finishedOrder?: number
  }> = []
  const trackedFeedRequests = new WeakMap<object, (typeof feedRequests)[number]>()
  const trackedHttpRequests = new WeakMap<object, (typeof httpRequests)[number]>()
  let requestOrder = 0
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return
    if (url.pathname === "/api/events") {
      const tracked = { after: url.searchParams.get("after") }
      feedRequests.push(tracked)
      trackedFeedRequests.set(request, tracked)
      return
    }
    const tracked = { method: request.method(), path: `${url.pathname}${url.search}`, requestOrder: ++requestOrder }
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
  return { context, api: mutationContext.request, page, member, cachedSessionId, feedRequests, httpRequests }
}
