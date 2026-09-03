import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"
import { e2eSessionCreate } from "./e2eSessionCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const syncTimeout = 45_000

/**
 * Both tabs use checked-in deterministic agents whose runtime echoes the submitted prompt.
 * Because each tab submits a run-unique prompt, the expected assistant text is distinct per
 * tab, which is what makes run/session demultiplexing and cross-tab isolation observable.
 * The seeded local server is used for both so each tab has a runnable execution agent.
 */
const tabScenarios = [
  { agentId: "example-agent-local", label: "build", serverId: "example-server-local" },
  { agentId: "example-agent-local-review", label: "review", serverId: "example-server-local" },
] as const

type TabScenario = (typeof tabScenarios)[number]

type Tab = {
  assistantText: string
  page: Page
  prompt: string
  scenario: TabScenario
  sessionId: string
}

declare global {
  interface Window {
    __codelineEventSourceUrls?: string[]
  }
}

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  // Counting constructed EventSource instances is the only reliable per-tab proof:
  // the browser's own transparent reconnects reuse one instance, while a duplicated
  // client feed would construct a second one.
  await context.addInitScript(() => {
    const native = window.EventSource
    const created: string[] = []
    window.__codelineEventSourceUrls = created
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

async function eventFeedSourceUrlsRead(page: Page): Promise<string[]> {
  return page.evaluate(() => (window.__codelineEventSourceUrls ?? []).filter((url) => url.includes("/api/events")))
}

async function sessionCreate(
  context: BrowserContext,
  input: { agentId: string; clientRequestId: string; serverId: string; title: string },
): Promise<string> {
  const response = await e2eSessionCreate(context, baseOrigin, {
    clientRequestId: input.clientRequestId,
    primaryAgentId: input.agentId,
    serverId: input.serverId,
    title: input.title,
  })
  expect(response.ok(), await response.text()).toBe(true)
  const body = (await response.json()) as { session: { id: string } }
  return body.session.id
}

async function promptSubmit(tab: Tab): Promise<void> {
  const composer = tab.page.getByRole("form", { name: "Chat composer" })
  await expect(composer).toBeVisible({ timeout: syncTimeout })
  const messageInput = composer.getByLabel("Message")
  await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
  await messageInput.fill(tab.prompt)
  await composer.getByRole("button", { name: "Send" }).click()
}

test("two tabs run parallel deterministic runs over one event feed each without cross-tab corruption", async ({
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

    const tabs: Tab[] = []
    for (const scenario of tabScenarios) {
      const agentsResponse = await context.request.get(`${baseOrigin}/api/servers/${scenario.serverId}/agents`)
      expect(agentsResponse.ok(), await agentsResponse.text()).toBe(true)
      const agentList = (await agentsResponse.json()) as { agents: Array<{ id: string }> }
      expect(agentList.agents.map((agent) => agent.id)).toContain(scenario.agentId)

      const sessionId = await sessionCreate(context, {
        agentId: scenario.agentId,
        clientRequestId: `e2e-tabs-${runId}-${scenario.label}`,
        serverId: scenario.serverId,
        title: `Parallel tabs ${scenario.label} ${runId}`,
      })
      const prompt = `parallel ${scenario.label} ${runId}`
      tabs.push({
        assistantText: `Deterministic response: ${prompt}`,
        page: await context.newPage(),
        prompt,
        scenario,
        sessionId,
      })
    }

    await Promise.all(tabs.map((tab) => tab.page.goto(`/sessions/${encodeURIComponent(tab.sessionId)}`)))
    // Both runs are submitted before either is awaited so the single per-tab feed
    // has to demultiplex two concurrent runs of the same application user.
    await Promise.all(tabs.map((tab) => promptSubmit(tab)))

    for (const tab of tabs) {
      const recentActivity = tab.page.getByRole("list", { name: "Recent semantic activity", exact: true })
      const latestAnswer = tab.page.getByRole("region", { name: "Latest agent answer", exact: true })
      await expect(latestAnswer).toContainText(tab.assistantText, { timeout: syncTimeout })
      await expect(recentActivity.getByText(tab.prompt, { exact: true })).toBeVisible({ timeout: syncTimeout })
    }

    for (const tab of tabs) {
      // The completion checkpoint supersedes the in-flight turn: leaving the partially
      // observed assistant fragment behind would render the answer twice.
      await expect(tab.page.getByRole("list", { name: "In-flight messages" })).toHaveCount(0, {
        timeout: syncTimeout,
      })
    }

    for (const tab of tabs) {
      const other = tabs.find((candidate) => candidate !== tab)
      if (other === undefined) throw new Error("The parallel tab fixture requires two tabs.")
      // No cross-tab state corruption: neither the other run's output nor the other
      // tab's prompt may leak into this tab's conversation workspace.
      const workspace = tab.page.getByRole("region", { name: "Conversation workspace" })
      await expect(workspace.getByText(other.assistantText)).toHaveCount(0)
      await expect(workspace.getByText(other.prompt, { exact: true })).toHaveCount(0)
    }

    for (const tab of tabs) {
      const urls = await eventFeedSourceUrlsRead(tab.page)
      expect(urls, `tab ${tab.scenario.label} opened ${urls.length} event feeds`).toHaveLength(1)
      expect(urls[0]).toContain("/api/events")
    }

    // The feed survives the parallel runs: a reload must still leave exactly one
    // feed per tab and must reconcile the finalized authoritative snapshot.
    const first = tabs[0]
    if (first === undefined) throw new Error("The parallel tab fixture requires two tabs.")
    await first.page.reload()
    const reloadedLatestAnswer = first.page.getByRole("region", { name: "Latest agent answer", exact: true })
    await expect(reloadedLatestAnswer).toHaveCount(1, { timeout: syncTimeout })
    await expect(reloadedLatestAnswer).toContainText(first.assistantText)
    expect(await eventFeedSourceUrlsRead(first.page)).toHaveLength(1)
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

/**
 * The detached-reload scenario keeps the run open long enough for a second tab to
 * open the same session while the first tab's run is still active, which is what
 * makes convergence rather than duplication observable.
 */
const convergenceScenario = {
  agentId: "example-agent-simulation-detached-reload",
  finalText: "The detached deterministic run finished after the reload.",
  firstText: "The detached deterministic run started.",
  serverId: "example-server-local",
} as const

test("two tabs on the same session converge on one authoritative transcript for one detached run", async ({
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

    const sessionId = await sessionCreate(context, {
      agentId: convergenceScenario.agentId,
      clientRequestId: `e2e-converge-${runId}`,
      serverId: convergenceScenario.serverId,
      title: `Converging tabs ${runId}`,
    })
    const prompt = `converging tabs ${runId}`

    const first = await context.newPage()
    await first.goto(`/sessions/${encodeURIComponent(sessionId)}`)
    await promptSubmit({
      assistantText: convergenceScenario.finalText,
      page: first,
      prompt,
      scenario: tabScenarios[0],
      sessionId,
    })

    // The run is detached and still active, so the second tab has to discover it
    // over HTTP instead of inheriting any client state from the first tab.
    const activeResponse = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/active-runs`)
    expect(activeResponse.ok(), await activeResponse.text()).toBe(true)
    await expect
      .poll(
        async () => {
          const response = await (context as BrowserContext).request.get(
            `${baseOrigin}/api/sessions/${sessionId}/active-runs`,
          )
          return ((await response.json()) as { runs: Array<{ runId: string }> }).runs.length
        },
        { timeout: syncTimeout },
      )
      .toBe(1)

    const second = await context.newPage()
    await second.goto(`/sessions/${encodeURIComponent(sessionId)}`)
    await expect(second.getByRole("form", { name: "Chat composer" })).toBeVisible({ timeout: syncTimeout })

    // Both tabs settle on the same authoritative transcript, each exactly once.
    for (const page of [first, second]) {
      const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
      const latestAnswer = page.getByRole("region", { name: "Latest agent answer", exact: true })
      await expect(latestAnswer).toHaveCount(1, { timeout: syncTimeout })
      await expect(latestAnswer).toContainText(convergenceScenario.finalText)
      await expect(recentActivity.getByText(prompt, { exact: true })).toHaveCount(1, { timeout: syncTimeout })
      await expect(page.getByRole("list", { name: "In-flight messages" })).toHaveCount(0, { timeout: syncTimeout })
      // Neither tab replayed the partial fragment as a second, separate message.
      await expect(latestAnswer.getByText(convergenceScenario.firstText)).toHaveCount(1)
      // Each tab owns one feed at a time. The tab that joined mid-run additionally
      // reattaches once, after the run snapshot's cursor, rather than replaying blindly.
      const feedUrls = await eventFeedSourceUrlsRead(page)
      expect(feedUrls.length).toBeGreaterThanOrEqual(1)
      expect(feedUrls.length).toBeLessThanOrEqual(2)
      for (const url of feedUrls.slice(1)) expect(url).toContain("after=")
    }

    // One durable run backed both tabs; convergence did not start a second run.
    const messagesResponse = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/messages`)
    expect(messagesResponse.ok(), await messagesResponse.text()).toBe(true)
    const messages = ((await messagesResponse.json()) as { messages: Array<{ role: string }> }).messages
    expect(messages.filter((message) => message.role === "user")).toHaveLength(1)
    expect(messages.filter((message) => message.role === "assistant")).toHaveLength(1)
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
