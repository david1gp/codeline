import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eMetricsCountersRead } from "./e2eMetricsCountersRead.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const settledSessionId = "example-session-active-1"

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

test("the managed diagnostics metrics report snapshot and event feed counters", async ({ browser }) => {
  test.setTimeout(90_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let cleanupError: unknown
  let deletedUserIds: string[] = []

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })
    context = await memberContextOpen(browser, member.token)

    const unauthenticated = await browser.newContext({ baseURL: baseOrigin })
    const anonymousMetrics = await unauthenticated.request.get(`${baseOrigin}/api/diagnostics/metrics`)
    expect(anonymousMetrics.status()).toBe(401)
    await unauthenticated.close()

    const before = await e2eMetricsCountersRead(context.request, baseOrigin)

    const snapshot = await context.request.get(`${baseOrigin}/api/sessions/${settledSessionId}/snapshot`)
    expect(snapshot.status()).toBe(200)
    const snapshotBody = (await snapshot.json()) as { etag: string; settled: boolean }
    expect(snapshotBody.settled).toBe(true)

    const notModified = await context.request.get(`${baseOrigin}/api/sessions/${settledSessionId}/snapshot`, {
      headers: { "If-None-Match": snapshotBody.etag },
    })
    expect(notModified.status()).toBe(304)

    const page = await context.newPage()
    await page.goto("/api/health")
    const opened = await page.evaluate(async () => {
      const controller = new AbortController()
      const response = await fetch("/api/events", {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      })
      const reader = response.body?.getReader()
      if (reader === undefined) throw new Error("The managed event feed has no readable body.")
      await reader.read()
      await reader.cancel()
      controller.abort()
      return response.status
    })
    expect(opened).toBe(200)
    await page.close()

    // The connection teardown counter is recorded after the browser drops the
    // response, so the feed deltas are polled until the server has observed it.
    const request = context.request
    await expect
      .poll(
        async () => {
          const after = await e2eMetricsCountersRead(request, baseOrigin)
          return {
            notModified:
              after("snapshot_response_total", { status: "304" }) -
              before("snapshot_response_total", { status: "304" }),
            opened: after("sse_connections_open_total") - before("sse_connections_open_total"),
            served:
              after("snapshot_response_total", { status: "200" }) -
              before("snapshot_response_total", { status: "200" }),
            terminated:
              after("sse_connections_close_total") +
              after("sse_connections_disconnect_total") -
              before("sse_connections_close_total") -
              before("sse_connections_disconnect_total"),
          }
        },
        { intervals: [250, 500, 1000, 2000], timeout: 30_000 },
      )
      .toEqual({ notModified: 1, opened: 1, served: 1, terminated: 1 })
  } finally {
    await context?.close()
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
