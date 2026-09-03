import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eBrowserDiagnosticsInstall } from "./e2eBrowserDiagnosticsInstall.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"
import { e2eSessionCreate } from "./e2eSessionCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const lunaAgentId = "luna-high"
const lunaModel = "gpt-5.6-luna"
const lunaProvider = "codex-lb"
const lunaModelSelection = `${lunaProvider}/${lunaModel}`
const syncTimeout = 120_000

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

test("Luna low-effort chat preserves the selected execution and finalizes ping pong", async ({ browser }) => {
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let diagnostics: ReturnType<typeof e2eBrowserDiagnosticsInstall> | undefined
  let deletedUserIds: string[] = []
  let diagnosticsError: unknown
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    context = await memberContextOpen(browser, member.token)

    const serversResponse = await context.request.get(`${baseOrigin}/api/servers`)
    expect(serversResponse.ok(), await serversResponse.text()).toBe(true)
    const serverList = (await serversResponse.json()) as { servers: Array<{ id: string }> }

    let lunaServer: { id: string } | undefined
    for (const server of serverList.servers) {
      const agentsResponse = await context.request.get(`${baseOrigin}/api/servers/${server.id}/agents`)
      expect(agentsResponse.ok(), await agentsResponse.text()).toBe(true)
      const agentList = (await agentsResponse.json()) as { agents: Array<{ id: string }> }
      if (agentList.agents.some((agent) => agent.id === lunaAgentId)) {
        lunaServer = server
        break
      }
    }
    expect(lunaServer, "Seed required: no server exposes the luna-high agent.").toBeDefined()

    const sessionResponse = await e2eSessionCreate(context, baseOrigin, {
      clientRequestId: `e2e-luna-low-effort-${runId}`,
      primaryAgentId: lunaAgentId,
      serverId: lunaServer?.id,
      title: `Luna low effort ${runId}`,
    })
    expect(sessionResponse.ok(), await sessionResponse.text()).toBe(true)
    const sessionBody = (await sessionResponse.json()) as { session: { id: string } }
    const sessionId = sessionBody.session.id
    const sessionDetailEventsPath = `/api/sessions/${encodeURIComponent(sessionId)}/events`
    const delegationsPath = `/api/sessions/${encodeURIComponent(sessionId)}/delegations`

    const page = await context.newPage()
    diagnostics = e2eBrowserDiagnosticsInstall(page, test.info(), {
      // The session view cancels its initial delegations read when the selected
      // session finishes loading; that intentional fetch abort is not a browser error.
      expected: (event) =>
        event.kind === "requestfailed" &&
        event.method === "GET" &&
        event.errorText === "net::ERR_ABORTED" &&
        (() => {
          try {
            const url = new URL(event.url)
            return (
              url.origin === new URL(baseOrigin).origin &&
              (url.pathname === sessionDetailEventsPath || url.pathname === delegationsPath)
            )
          } catch (_error) {
            return false
          }
        })(),
    })
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)

    const providerModel = page.getByLabel("Provider model")
    const reasoningEffort = page.getByLabel("Reasoning effort")
    await expect(providerModel).toBeEnabled({ timeout: syncTimeout })
    await providerModel.selectOption(lunaModelSelection)
    await expect(providerModel).toHaveValue(lunaModelSelection)
    await expect(reasoningEffort).toBeEnabled({ timeout: syncTimeout })
    await reasoningEffort.selectOption("low")
    await expect(reasoningEffort).toHaveValue("low")

    const prompt = "ping"
    const chatRequestPromise = page.waitForRequest(
      (request) => request.method() === "POST" && request.url().endsWith(`/api/sessions/${sessionId}/chat`),
    )
    const composer = page.getByRole("form", { name: "Chat composer" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    const messageInput = composer.getByLabel("Message")
    await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
    await messageInput.fill(prompt)
    await composer.getByRole("button", { name: "Send" }).click()

    const chatRequest = await chatRequestPromise
    expect(chatRequest.postDataJSON()).toEqual({
      context: [
        {
          codelineExecution: {
            agentId: lunaAgentId,
            model: lunaModel,
            provider: lunaProvider,
            reasoningEffort: "low",
          },
        },
      ],
      forwardedProps: {
        codelineExecution: {
          agentId: lunaAgentId,
          model: lunaModel,
          provider: lunaProvider,
          reasoningEffort: "low",
        },
      },
      messages: [{ content: prompt, id: expect.any(String), role: "user" }],
      runId: expect.any(String),
      threadId: sessionId,
      tools: [],
    })

    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    const latestAnswer = page.getByRole("region", { name: "Latest agent answer", exact: true })
    const userMessages = recentActivity.locator("li[data-session-message-role='user']")
    await expect(latestAnswer).toHaveCount(1, { timeout: syncTimeout })
    await expect(userMessages).toHaveCount(1, { timeout: syncTimeout })
    await expect(latestAnswer.getByText("pong", { exact: true })).toBeVisible({ timeout: syncTimeout })
    await expect(userMessages.getByText(prompt, { exact: true })).toBeVisible({ timeout: syncTimeout })
    await expect(page.getByRole("list", { name: "Run failures" })).toHaveCount(0, { timeout: syncTimeout })
    await expect(page.getByRole("alert")).toHaveCount(0, { timeout: syncTimeout })
  } finally {
    try {
      await diagnostics?.finalize()
    } catch (error) {
      diagnosticsError = error
    }
    try {
      await context?.close()
    } catch (error) {
      cleanupError = error
    }
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (diagnosticsError !== undefined) throw diagnosticsError
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
