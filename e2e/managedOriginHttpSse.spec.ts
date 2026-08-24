import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const settledSessionId = "example-session-active-1"

type SseFirstChunk = {
  body: string
  elapsedMs: number
  headers: Record<string, string>
  status: number
}

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function sseFirstChunkRead(page: Page): Promise<SseFirstChunk> {
  return page.evaluate(async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    const startedAt = performance.now()
    try {
      const response = await fetch("/api/events", {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      })
      const reader = response.body?.getReader()
      if (reader === undefined) throw new Error("The managed event feed has no readable body.")
      const first = await reader.read()
      if (first.done || first.value === undefined)
        throw new Error("The managed event feed closed before its first frame.")
      await reader.cancel()
      return {
        body: new TextDecoder().decode(first.value),
        elapsedMs: performance.now() - startedAt,
        headers: Object.fromEntries(response.headers.entries()),
        status: response.status,
      }
    } finally {
      clearTimeout(timeout)
      controller.abort()
    }
  })
}

test("the managed public origin streams SSE and serves compressed conditional snapshots", async ({ browser }) => {
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

    const page = await context.newPage()
    await page.goto("/api/health")
    const sse = await sseFirstChunkRead(page)
    expect(sse.status, sse.body).toBe(200)
    expect(sse.headers["cache-control"]).toBe("no-cache, no-transform")
    expect(sse.headers["content-type"]).toContain("text/event-stream")
    expect(sse.headers["x-accel-buffering"]).toBe("no")
    expect(sse.body).toContain(": heartbeat")
    expect(sse.elapsedMs).toBeLessThan(20_000)
    await page.close()

    const snapshot = await context.request.get(`${baseOrigin}/api/sessions/${settledSessionId}/snapshot`, {
      headers: { "Accept-Encoding": "gzip" },
    })
    expect(snapshot.status()).toBe(200)
    expect(snapshot.headers()["cache-control"]).toBe("private, no-cache")
    expect(snapshot.headers().vary).toBe("Cookie, Accept-Encoding")
    expect(snapshot.headers()["content-encoding"]).toBe("gzip")
    const snapshotBody = (await snapshot.json()) as {
      asOfCursor: string
      etag: string
      messages: Array<{ sequence: number }>
      session: { id: string }
      settled: boolean
    }
    expect(snapshotBody.settled).toBe(true)
    expect(snapshotBody.session.id).toBe(settledSessionId)
    expect(snapshotBody.messages.map((message) => message.sequence)).toEqual([1, 2])
    expect(snapshotBody.asOfCursor).toEqual(expect.any(String))
    expect(snapshot.headers().etag).toBe(snapshotBody.etag)

    const notModified = await context.request.get(`${baseOrigin}/api/sessions/${settledSessionId}/snapshot`, {
      headers: { "Accept-Encoding": "gzip", "If-None-Match": snapshotBody.etag },
    })
    expect(notModified.status()).toBe(304)
    expect(notModified.headers().etag).toBe(snapshotBody.etag)
    expect(notModified.headers().vary).toBe("Cookie, Accept-Encoding")
    expect(await notModified.body()).toHaveLength(0)
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
