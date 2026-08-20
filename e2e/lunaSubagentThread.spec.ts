import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const sessionCookieName = "__Host-codeline-session"
const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const lunaAgentId = "luna-high"
const syncTimeout = 120_000
const childInstruction =
  "call the sleep tool for exactly 10 seconds, then respond exactly ok; do not delegate or call any other tool"

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

test("Luna delegates to a Luna subagent and opens its streamed thread", async ({ browser }) => {
  test.setTimeout(180_000)
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const context = await memberContextOpen(browser, issued.members[0].token)
    contexts.push(context)

    const serversResponse = await context.request.get(`${baseOrigin}/api/servers`)
    if (!serversResponse.ok()) {
      throw new Error(`GET /api/servers failed with status ${serversResponse.status()}.`)
    }
    const serverList = (await serversResponse.json()) as { servers: Array<{ id: string; name: string }> }
    if (serverList.servers.length === 0) throw new Error("Seed required: GET /api/servers returned no servers.")

    let lunaServer: { id: string; name: string } | undefined
    for (const server of serverList.servers) {
      const agentsResponse = await context.request.get(`${baseOrigin}/api/servers/${server.id}/agents`)
      if (!agentsResponse.ok()) {
        throw new Error(`GET /api/servers/${server.id}/agents failed with status ${agentsResponse.status()}.`)
      }
      const agentList = (await agentsResponse.json()) as { agents: Array<{ id: string }> }
      if (agentList.agents.some((agent) => agent.id === lunaAgentId)) {
        lunaServer = server
        break
      }
    }
    if (lunaServer === undefined) throw new Error("Seed required: no server exposes the luna-high agent.")

    const sessionResponse = await context.request.post(`${baseOrigin}/api/sessions`, {
      data: {
        clientRequestId: `e2e-luna-subagent-${runId}`,
        primaryAgentId: lunaAgentId,
        serverId: lunaServer.id,
        title: `Luna subagent thread ${runId}`,
      },
      headers: { origin: baseOrigin },
    })
    expect(sessionResponse.ok()).toBe(true)
    const sessionBody = (await sessionResponse.json()) as { session: { id: string } }
    const sessionId = sessionBody.session.id

    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)
    await expect(page.getByRole("button", { name: "Stream view" })).toBeVisible({ timeout: syncTimeout })
    await page.getByRole("button", { name: "Stream view" }).click()

    const composer = page.getByRole("form", { name: "Chat composer" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    const messageInput = composer.getByLabel("Message")
    await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
    await messageInput.fill(
      `Your first and only tool call must be delegate_task exactly once with agentId luna-high. Pass the Luna subagent exactly this instruction: ${childInstruction}. After the first delegate_task result returns, call no more tools and emit exactly lowercase ok as your final response, with nothing else.`,
    )
    await composer.getByRole("button", { name: "Send" }).click()

    const delegationButtons = page.getByRole("button", { name: /Open subagent thread:/ })
    await expect(delegationButtons).toHaveCount(1, { timeout: syncTimeout })
    const delegationButton = delegationButtons.first()
    await expect(delegationButton).toBeVisible({ timeout: syncTimeout })
    await expect(delegationButton).toHaveAccessibleName(
      new RegExp(`^Open subagent thread: delegate_task\\. Task: ${childInstruction}\\.?$`),
    )
    await expect(delegationButton).toContainText("subagent")
    await expect(delegationButton).toContainText(/sleep/i)

    await expect(delegationButton).toHaveAttribute("data-child-agent-id", lunaAgentId)
    await delegationButton.click()

    const panel = page.locator("#workspace-right-panel")
    await expect(panel).toBeVisible({ timeout: syncTimeout })
    await expect(panel).toHaveAccessibleName("Subagent thread")
    await expect(panel.getByText("Subagent thread", { exact: true })).toBeVisible()
    const childStream = panel.getByRole("region", { name: "Subagent execution stream" })
    await expect(childStream).toBeVisible()
    await expect(childStream).not.toContainText("Loading child stream...", { timeout: syncTimeout })

    const childTerminal = childStream.locator("li").filter({ hasText: "Terminal" })
    await expect(childTerminal).toHaveCount(1, { timeout: syncTimeout })
    await expect(childTerminal.locator("span").last()).toHaveText("· completed", { timeout: syncTimeout })

    const childOutput = childStream.locator("li").filter({ hasText: "Output" }).locator(".text-placeholder")
    await expect(childOutput).toHaveCount(1, { timeout: syncTimeout })
    await expect(childOutput).toHaveText(/^ok$/, { timeout: syncTimeout })

    // External Luna persists only text_delta and terminal events; assert the visible child result instead of internal tool events.
    await expect(page.getByText(/child_run_limit_exhausted/)).not.toBeVisible()
    await expect(page.getByText(/assistant_empty/)).not.toBeVisible()
    await expect(page.getByText(/run error/i)).not.toBeVisible()
    await expect(
      childStream
        .locator("li")
        .filter({ hasText: "Terminal" })
        .filter({
          hasText: /failed/i,
        }),
    ).toHaveCount(0)

    const parentMessages = page.getByRole("region", { name: "Finalized messages" })
    const parentAssistantMessages = parentMessages.locator('article[data-message-role="assistant"]')
    await expect(parentAssistantMessages).toHaveCount(1, { timeout: syncTimeout })
    const parentMessageBody = parentAssistantMessages.locator(".markdown-content--message")
    await expect(parentMessageBody).toBeVisible({ timeout: syncTimeout })
    await expect(parentMessageBody).toHaveText(/^ok$/, { timeout: syncTimeout })
  } finally {
    for (const context of contexts) await context.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
