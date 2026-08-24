import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

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
  const response = await context.request.post(`${baseOrigin}/api/sessions`, {
    data: {
      clientRequestId: input.clientRequestId,
      primaryAgentId: input.agentId,
      serverId: input.serverId,
      title: input.title,
    },
    headers: { origin: baseOrigin },
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
      const finalized = tab.page.getByRole("list", { name: "Finalized messages" })
      const assistantMessage = finalized.locator('article[data-message-role="assistant"]')
      const userMessage = finalized.locator('article[data-message-role="user"]')
      await expect(assistantMessage.getByText(tab.assistantText)).toBeVisible({ timeout: syncTimeout })
      await expect(userMessage.getByText(tab.prompt, { exact: true })).toBeVisible({ timeout: syncTimeout })
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
    const reloadedFinalized = first.page.getByRole("list", { name: "Finalized messages" })
    await expect(
      reloadedFinalized.locator('article[data-message-role="assistant"]').getByText(first.assistantText),
    ).toBeVisible({ timeout: syncTimeout })
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
