import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const serverId = "example-server-local"
const syncTimeout = 45_000

/**
 * The checked-in `detached-reload` simulation scenario emits its first fragment
 * immediately and then holds the run open for several seconds. That window is
 * what makes the reload meaningful: the run is provably still active while the
 * browser is torn down and rebuilt.
 */
const scenario = {
  agentId: "example-agent-simulation-detached-reload",
  finalText: "The detached deterministic run finished after the reload.",
  firstText: "The detached deterministic run started.",
} as const

/**
 * The `tool-activity-reload` scenario opens a tool call immediately and only
 * resolves it seconds later, so the reload provably happens while the tool call
 * is still open and the reattached tab observes its completion.
 */
const toolScenario = {
  agentId: "example-agent-simulation-tool-activity-reload",
  finalText: "The tool activity run finished after the reload.",
  firstText: "The tool activity run started.",
  toolCallId: "tool-activity-reload-1",
  toolName: "bash",
  toolResultText: "The deterministic tool call finished after the reload.",
} as const

declare global {
  interface Window {
    __codelineEventFeedUrls?: string[]
  }
}

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  // Recording constructed EventSource URLs is the only way to prove the reloaded
  // tab attached after the run snapshot's cursor rather than replaying blindly.
  await context.addInitScript(() => {
    const native = window.EventSource
    const created: string[] = []
    window.__codelineEventFeedUrls = created
    class TrackedEventSource extends native {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict)
        created.push(String(url))
      }
    }
    window.EventSource = TrackedEventSource
  })
  return context
}

async function eventFeedUrlsRead(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__codelineEventFeedUrls ?? []).filter((url) => url.includes("/api/events")))
}

type ActiveRunListResponse = { runs: Array<{ runId: string; status: string }> }
type ActiveRunSnapshotResponse = {
  lastCursor: string | null
  lastSequence: number
  partialText: string
  status: string
}

async function activeRunsRead(context: BrowserContext, sessionId: string): Promise<ActiveRunListResponse> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/active-runs`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as ActiveRunListResponse
}

async function activeRunSnapshotRead(
  context: BrowserContext,
  sessionId: string,
  runId: string,
): Promise<ActiveRunSnapshotResponse> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/runs/${runId}/snapshot`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as ActiveRunSnapshotResponse
}

test("a submitted prompt starts a detached run that survives reload and completes authoritatively", async ({
  browser,
}) => {
  test.setTimeout(180_000)
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

    const agentsResponse = await context.request.get(`${baseOrigin}/api/servers/${serverId}/agents`)
    expect(agentsResponse.ok(), await agentsResponse.text()).toBe(true)
    const agentList = (await agentsResponse.json()) as { agents: Array<{ id: string }> }
    expect(agentList.agents.map((agent) => agent.id)).toContain(scenario.agentId)

    const sessionResponse = await context.request.post(`${baseOrigin}/api/sessions`, {
      data: {
        clientRequestId: `e2e-detached-${runId}`,
        primaryAgentId: scenario.agentId,
        serverId,
        title: `Detached reload ${runId}`,
      },
      headers: { origin: baseOrigin },
    })
    expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
    const sessionId = ((await sessionResponse.json()) as { session: { id: string } }).session.id

    const prompt = `detached reload ${runId}`
    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)

    const composer = page.getByRole("form", { name: "Chat composer" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    const messageInput = composer.getByLabel("Message")
    await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
    await messageInput.fill(prompt)
    await composer.getByRole("button", { name: "Send" }).click()

    // Submission starts a detached run: the server owns it independently of this
    // page, and the first fragment is already persisted.
    await expect
      .poll(async () => (await activeRunsRead(context as BrowserContext, sessionId)).runs.length, {
        timeout: syncTimeout,
      })
      .toBe(1)
    const activeBeforeReload = await activeRunsRead(context, sessionId)
    const detachedRunId = activeBeforeReload.runs[0]?.runId
    if (detachedRunId === undefined) throw new Error("The detached run was not registered.")
    expect(activeBeforeReload.runs[0]?.status).toBe("running")

    await expect
      .poll(
        async () => (await activeRunSnapshotRead(context as BrowserContext, sessionId, detachedRunId)).partialText,
        {
          timeout: syncTimeout,
        },
      )
      .toContain(scenario.firstText)

    // Disconnect and reload. Only an explicit cancellation may stop a run, so the
    // run must still be active and still owned by the server afterwards.
    await page.reload()

    const afterReload = await activeRunsRead(context, sessionId)
    expect(afterReload.runs.map((run) => run.runId)).toEqual([detachedRunId])
    expect(afterReload.runs[0]?.status).toBe("running")

    const snapshotAfterReload = await activeRunSnapshotRead(context, sessionId, detachedRunId)
    expect(snapshotAfterReload.status).toBe("running")
    expect(snapshotAfterReload.partialText).toContain(scenario.firstText)
    expect(snapshotAfterReload.lastSequence).toBeGreaterThan(0)
    expect(snapshotAfterReload.lastCursor).toEqual(expect.any(String))

    // The reloaded tab reads the run-specific snapshot and only then attaches the
    // feed after that snapshot's cursor.
    const snapshotRequested = page.waitForResponse(
      (response) => response.url().includes(`/api/sessions/${sessionId}/runs/`) && response.url().endsWith("/snapshot"),
      { timeout: syncTimeout },
    )
    await expect(page.getByRole("form", { name: "Chat composer" })).toBeVisible({ timeout: syncTimeout })
    await snapshotRequested

    await expect
      .poll(async () => (await eventFeedUrlsRead(page)).some((url) => url.includes("after=")), {
        timeout: syncTimeout,
      })
      .toBe(true)

    const feedUrls = await eventFeedUrlsRead(page)
    const attachedUrl = feedUrls.find((url) => url.includes("after="))
    if (attachedUrl === undefined) throw new Error("The reloaded tab never attached the feed after a cursor.")
    expect(attachedUrl).toContain(`after=${encodeURIComponent(snapshotAfterReload.lastCursor as string)}`)

    // Eventual completion is rendered from the authoritative HTTP snapshot.
    const finalized = page.getByRole("list", { name: "Finalized messages" })
    await expect(finalized.locator('article[data-message-role="assistant"]').getByText(scenario.finalText)).toBeVisible(
      {
        timeout: syncTimeout,
      },
    )
    await expect(finalized.locator('article[data-message-role="user"]').getByText(prompt, { exact: true })).toBeVisible(
      {
        timeout: syncTimeout,
      },
    )

    // The run is settled server-side, so it is no longer an active run.
    const activeAfterCompletion = await activeRunsRead(context, sessionId)
    expect(activeAfterCompletion.runs).toEqual([])
    const finalSnapshot = await activeRunSnapshotRead(context, sessionId, detachedRunId)
    expect(finalSnapshot.status).toBe("succeeded")
    // Finalization deletes that run's now-obsolete deltas.
    expect(finalSnapshot.lastSequence).toBe(0)
    expect(finalSnapshot.partialText).toBe("")
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

test("a reload during open tool activity reattaches the run and observes the tool call completing", async ({
  browser,
}) => {
  test.setTimeout(180_000)
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

    const sessionResponse = await context.request.post(`${baseOrigin}/api/sessions`, {
      data: {
        clientRequestId: `e2e-tool-reload-${runId}`,
        primaryAgentId: toolScenario.agentId,
        serverId,
        title: `Tool activity reload ${runId}`,
      },
      headers: { origin: baseOrigin },
    })
    expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
    const sessionId = ((await sessionResponse.json()) as { session: { id: string } }).session.id

    const prompt = `tool activity reload ${runId}`
    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)

    const composer = page.getByRole("form", { name: "Chat composer" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    const messageInput = composer.getByLabel("Message")
    await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
    await messageInput.fill(prompt)
    await composer.getByRole("button", { name: "Send" }).click()

    await expect
      .poll(async () => (await activeRunsRead(context as BrowserContext, sessionId)).runs.length, {
        timeout: syncTimeout,
      })
      .toBe(1)
    const activeBeforeReload = await activeRunsRead(context, sessionId)
    const detachedRunId = activeBeforeReload.runs[0]?.runId
    if (detachedRunId === undefined) throw new Error("The detached run was not registered.")

    // The tool call has started and emitted its arguments, but its result is still
    // pending, so the reload happens inside the open tool lifecycle.
    await expect
      .poll(
        async () => (await activeRunSnapshotRead(context as BrowserContext, sessionId, detachedRunId)).partialText,
        {
          timeout: syncTimeout,
        },
      )
      .toContain(toolScenario.firstText)

    await page.reload()

    const afterReload = await activeRunsRead(context, sessionId)
    expect(afterReload.runs.map((run) => run.runId)).toEqual([detachedRunId])
    expect(afterReload.runs[0]?.status).toBe("running")

    // The reattached tab renders the durable stream, so the still-open tool call and
    // then its late result are both observable in the same reloaded page.
    await page.getByRole("button", { name: "Stream view" }).click()
    const stream = page.getByRole("region", { name: "Execution stream" })
    await expect(stream.getByText(toolScenario.toolName, { exact: true }).first()).toBeVisible({
      timeout: syncTimeout,
    })
    await expect(stream.getByText(toolScenario.toolResultText)).toBeVisible({ timeout: syncTimeout })

    await page.getByRole("button", { name: "Conversation view" }).click()
    const finalized = page.getByRole("list", { name: "Finalized messages" })
    await expect(
      finalized.locator('article[data-message-role="assistant"]').getByText(toolScenario.finalText),
    ).toBeVisible({ timeout: syncTimeout })

    const finalSnapshot = await activeRunSnapshotRead(context, sessionId, detachedRunId)
    expect(finalSnapshot.status).toBe("succeeded")
    expect((await activeRunsRead(context, sessionId)).runs).toEqual([])
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
