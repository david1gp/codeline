import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const serverId = "example-server-local"
const scenarioAgentId = "example-agent-simulation-compaction-summary"
const scenarioModel = "simulation-compaction-summary"
const scenarioProvider = "deterministic"
const summaryMarker = "Summary generation completed."
const syncTimeout = 45_000

type SessionChatResponse = { runId: string; sessionId: string }
type RunSnapshotResponse = { lastSequence: number; partialText: string; status: string }
type MessageRecord = { content: string; role: string }
type ActiveRunsResponse = { runs: unknown[] }

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function sessionCreate(context: BrowserContext, runId: string): Promise<string> {
  const response = await context.request.post(`${baseOrigin}/api/sessions`, {
    data: {
      clientRequestId: `e2e-compaction-${runId}`,
      primaryAgentId: scenarioAgentId,
      serverId,
      title: `Context compaction ${runId}`,
    },
    headers: { origin: baseOrigin },
  })
  expect(response.ok(), await response.text()).toBe(true)
  const body = (await response.json()) as { session: { id: string; primaryAgentId: string; serverId: string } }
  expect(body.session).toMatchObject({ primaryAgentId: scenarioAgentId, serverId })
  return body.session.id
}

async function messagesRead(context: BrowserContext, sessionId: string): Promise<MessageRecord[]> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/messages`)
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { messages: MessageRecord[] }).messages
}

async function runSnapshotRead(
  context: BrowserContext,
  sessionId: string,
  runId: string,
): Promise<RunSnapshotResponse> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/runs/${runId}/snapshot`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as RunSnapshotResponse
}

async function activeRunsRead(context: BrowserContext, sessionId: string): Promise<ActiveRunsResponse> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/active-runs`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as ActiveRunsResponse
}

async function chatSubmit(page: Page, sessionId: string, prompt: string): Promise<SessionChatResponse> {
  const composer = page.getByRole("form", { name: "Chat composer" })
  const messageInput = composer.getByLabel("Message")
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && response.url().endsWith(`/api/sessions/${sessionId}/chat`),
  )
  await messageInput.fill(prompt)
  await composer.getByRole("button", { name: "Send" }).click()
  const response = await responsePromise
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as SessionChatResponse
}

function historyPromptsCreate(runId: string): string[] {
  const durableBlock = "This deterministic source history must remain available after compaction. "
    .repeat(120)
    .trimEnd()
  return ["source goal", "source constraint", "source decision", "source progress"].map(
    (label) => `${label} ${runId}\n${durableBlock}`,
  )
}

test("manual deterministic compaction stays transient across completion and reload", async ({ browser }) => {
  test.setTimeout(240_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })
    context = await memberContextOpen(browser, member.token)

    const agentResponse = await context.request.get(`${baseOrigin}/api/servers/${serverId}/agents/${scenarioAgentId}`)
    expect(agentResponse.ok(), await agentResponse.text()).toBe(true)
    const agentBody = (await agentResponse.json()) as {
      agent: { configuration: { model: string; provider: string }; id: string; serverId: string }
    }
    expect(agentBody.agent).toMatchObject({
      configuration: { model: scenarioModel, provider: scenarioProvider },
      id: scenarioAgentId,
      serverId,
    })

    const sessionId = await sessionCreate(context, runId)
    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)

    const composer = page.getByRole("form", { name: "Chat composer" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    const messageInput = composer.getByLabel("Message")
    await expect(messageInput).toBeEnabled({ timeout: syncTimeout })

    // The seeded deterministic provider supplies every response, while these
    // run-unique, checked-in test prompts make the durable source history large
    // enough for the configured recent-context budget to leave older messages
    // eligible for manual compaction.
    const historyPrompts = historyPromptsCreate(runId)
    for (const [index, prompt] of historyPrompts.entries()) {
      const response = await chatSubmit(page, sessionId, prompt)
      expect(response.sessionId).toBe(sessionId)
      const finalized = page.getByRole("list", { name: "Finalized messages" })
      await expect(finalized.locator('article[data-message-role="user"]')).toHaveCount(index + 1, {
        timeout: syncTimeout,
      })
      await expect(finalized.locator('article[data-message-role="assistant"]')).toHaveCount(index + 1, {
        timeout: syncTimeout,
      })
      await expect(finalized.locator('article[data-message-role="assistant"]').nth(index)).toContainText(
        summaryMarker,
        {
          timeout: syncTimeout,
        },
      )
      await expect(page.getByRole("list", { name: "In-flight messages" })).toHaveCount(0, { timeout: syncTimeout })
    }

    const sourceMessages = await messagesRead(context, sessionId)
    expect(sourceMessages.map(({ content }) => content)).toEqual(
      historyPrompts.flatMap((prompt) => [prompt, expect.any(String)]),
    )
    expect(sourceMessages.filter(({ role }) => role === "user")).toHaveLength(historyPrompts.length)
    expect(sourceMessages.some(({ content }) => content.trim() === "/compact")).toBe(false)

    const manualResponse = await chatSubmit(page, sessionId, "/compact")
    expect(manualResponse.sessionId).toBe(sessionId)
    await expect
      .poll(async () => (await runSnapshotRead(context as BrowserContext, sessionId, manualResponse.runId)).status, {
        timeout: syncTimeout,
      })
      .toBe("succeeded")
    await expect
      .poll(async () => (await activeRunsRead(context as BrowserContext, sessionId)).runs.length, {
        timeout: syncTimeout,
      })
      .toBe(0)
    await expect(page.getByText("Response complete.", { exact: true })).toBeVisible({ timeout: syncTimeout })

    // The successful compaction run is terminal, but its control prompt is
    // neither a durable transcript row nor a visible finalized message.
    const afterManualMessages = await messagesRead(context, sessionId)
    expect(afterManualMessages).toEqual(sourceMessages)
    expect(afterManualMessages.some(({ content }) => content.trim() === "/compact")).toBe(false)
    const finalizedAfterManual = page.getByRole("list", { name: "Finalized messages" })
    await expect(finalizedAfterManual.locator('article[data-message-role="user"]')).toHaveCount(historyPrompts.length)
    await expect(finalizedAfterManual.locator('article[data-message-role="assistant"]')).toHaveCount(
      historyPrompts.length,
    )
    await expect(page.getByText("/compact", { exact: true })).toHaveCount(0)

    await page.reload()
    const reloadedFinalized = page.getByRole("list", { name: "Finalized messages" })
    await expect(reloadedFinalized).toBeVisible({ timeout: syncTimeout })
    await expect(reloadedFinalized.locator('article[data-message-role="user"]')).toHaveCount(historyPrompts.length, {
      timeout: syncTimeout,
    })
    await expect(reloadedFinalized.locator('article[data-message-role="assistant"]')).toHaveCount(
      historyPrompts.length,
      {
        timeout: syncTimeout,
      },
    )
    for (const prompt of historyPrompts) {
      await expect(reloadedFinalized.getByText(prompt.slice(0, prompt.indexOf("\n")), { exact: false })).toBeVisible({
        timeout: syncTimeout,
      })
    }
    await expect(page.getByText("/compact", { exact: true })).toHaveCount(0)
    expect(await messagesRead(context, sessionId)).toEqual(sourceMessages)

    const followUp = `post-compaction follow-up ${runId}`
    const followUpResponse = await chatSubmit(page, sessionId, followUp)
    expect(followUpResponse.sessionId).toBe(sessionId)
    await expect(
      reloadedFinalized.locator('article[data-message-role="user"]').getByText(followUp, { exact: true }),
    ).toBeVisible({ timeout: syncTimeout })
    await expect(reloadedFinalized.locator('article[data-message-role="assistant"]')).toHaveCount(
      historyPrompts.length + 1,
      { timeout: syncTimeout },
    )
    await expect(reloadedFinalized.locator('article[data-message-role="assistant"]').last()).toContainText(
      summaryMarker,
      {
        timeout: syncTimeout,
      },
    )
    await expect(page.getByRole("list", { name: "In-flight messages" })).toHaveCount(0, { timeout: syncTimeout })
    await expect
      .poll(async () => (await runSnapshotRead(context as BrowserContext, sessionId, followUpResponse.runId)).status, {
        timeout: syncTimeout,
      })
      .toBe("succeeded")

    // With the session left at its `~` project reference the composer submits
    // this non-exact form through the ordinary chat route, where command parsing
    // rejects it; it must not enter the exact manual-compaction branch.
    await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
    const argumentResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.url().endsWith(`/api/sessions/${sessionId}/chat`),
    )
    await messageInput.fill("/compact arg")
    await composer.getByRole("button", { name: "Send" }).click()
    const argumentResponse = await argumentResponsePromise
    expect(argumentResponse.status()).toBe(400)
    expect((await messagesRead(context, sessionId)).some(({ content }) => content.trim() === "/compact arg")).toBe(
      false,
    )
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
