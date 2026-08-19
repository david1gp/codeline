import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const sessionCookieName = "__Host-codeline-session"
const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const lunaAgentId = "luna-high"
const syncTimeout = 30_000

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

test("Luna answers ping with a finalized pong", async ({ browser }) => {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    // The helper issues two members, but this focused flow only needs the first one.
    const issued = await e2eMemberSessionsIssue(runId)
    const context = await memberContextOpen(browser, issued.members[0].token)
    contexts.push(context)

    const serversResponse = await context.request.get(`${baseOrigin}/api/servers`)
    if (!serversResponse.ok()) {
      throw new Error(`GET /api/servers failed with status ${serversResponse.status()}.`)
    }
    const serverList = (await serversResponse.json()) as { servers: Array<{ id: string; name: string }> }
    if (serverList.servers.length === 0) {
      throw new Error("Seed required: GET /api/servers returned no servers.")
    }

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
    if (lunaServer === undefined) {
      throw new Error("Seed required: no server from GET /api/servers exposes the luna-high agent.")
    }

    const title = `Luna ping pong ${runId}`
    const sessionResponse = await context.request.post(`${baseOrigin}/api/sessions`, {
      data: {
        clientRequestId: `e2e-luna-${runId}`,
        primaryAgentId: lunaAgentId,
        serverId: lunaServer.id,
        title,
      },
      headers: { origin: baseOrigin },
    })
    expect(sessionResponse.ok()).toBe(true)
    const sessionBody = (await sessionResponse.json()) as { session: { id: string } }
    const sessionId = sessionBody.session.id

    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)
    const composer = page.getByRole("form", { name: "Chat composer" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    const messageInput = composer.getByLabel("Message")
    await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
    await messageInput.fill("ping")
    await composer.getByRole("button", { name: "Send" }).click()

    const finalizedMessages = page.getByRole("list", { name: "Finalized messages" })
    const assistantMessage = finalizedMessages.locator('article[data-message-role="assistant"]')
    const userMessage = finalizedMessages.locator('article[data-message-role="user"]')
    await expect(assistantMessage.getByText("pong", { exact: true })).toBeVisible({ timeout: syncTimeout })
    await expect(userMessage.getByText("ping", { exact: true })).toBeVisible({ timeout: syncTimeout })
    await expect(page.getByText("No finalized messages yet.", { exact: true })).toHaveCount(0, {
      timeout: syncTimeout,
    })
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
