import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { oidcEnvironmentConfigurationResolve } from "../scripts/oidcEnvironmentConfigurationResolve.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const sessionCookieName = "__Host-codeline-session"
const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const oidcEnvironment = oidcEnvironmentConfigurationResolve(process.env)
if (!oidcEnvironment.success) throw new Error(oidcEnvironment.errorMessage)

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function agentOptionsRead(context: BrowserContext): Promise<string[]> {
  const page = await context.newPage()
  await page.goto("/sessions?tab=recent")
  const agentSelect = page.getByLabel("Agent for a new session")
  await expect(agentSelect).toBeEnabled()
  const options = await agentSelect.locator("option").allTextContents()
  await page.close()
  return options
}

test("organization members share targets while personal sessions stay private", async ({ browser }) => {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    // Issuing happens inside the guarded block, so a member that was created before a
    // later issuing step failed is still removed by the cleanup below.
    const issued = await e2eMemberSessionsIssue(runId)

    // The issuing script only returns members whose membership row points at the
    // configured organization, so the shared-target assertions below cannot pass
    // through an unrelated organization.
    expect(issued.organizationExternalId).toBe(oidcEnvironment.data.organizationExternalId)
    expect(issued.organizationId.length).toBeGreaterThan(0)
    expect(issued.subjectPrefix).toContain(runId)

    const [memberOne, memberTwo] = issued.members
    const contextOne = await memberContextOpen(browser, memberOne.token)
    const contextTwo = await memberContextOpen(browser, memberTwo.token)
    contexts.push(contextOne, contextTwo)

    const serversOne = await contextOne.request.get(`${baseOrigin}/api/servers`)
    const serversTwo = await contextTwo.request.get(`${baseOrigin}/api/servers`)
    expect(serversOne.status()).toBe(200)
    expect(serversTwo.status()).toBe(200)
    const serverListOne = (await serversOne.json()) as { servers: Array<{ id: string; name: string }> }
    const serverListTwo = (await serversTwo.json()) as { servers: Array<{ id: string; name: string }> }
    expect(serverListOne.servers.length).toBeGreaterThan(0)
    expect(serverListTwo.servers).toEqual(serverListOne.servers)

    expect(await agentOptionsRead(contextTwo)).toEqual(await agentOptionsRead(contextOne))

    const firstServer = serverListOne.servers[0]
    if (firstServer === undefined) throw new Error("The organization exposes no server.")
    const agentResponse = await contextOne.request.get(`${baseOrigin}/api/servers/${firstServer.id}/agents`)
    const agentList = (await agentResponse.json()) as {
      agents: Array<{ id: string; parentAgentId: string | null; role: string }>
    }
    const primaryAgent = agentList.agents.find((agent) => agent.parentAgentId === null && agent.role === "primary")
    if (primaryAgent === undefined) throw new Error("The organization server exposes no primary agent.")

    // Both members create a session on the same shared target, which proves shared use and
    // gives each member a rendered conversation list for the isolation assertion.
    const privateTitle = `Private session ${runId}`
    const sharedTitle = `Shared target session ${runId}`
    const sessionCreate = (context: BrowserContext, title: string, clientRequestId: string) =>
      context.request.post(`${baseOrigin}/api/sessions`, {
        data: { clientRequestId, primaryAgentId: primaryAgent.id, serverId: firstServer.id, title },
        headers: { origin: baseOrigin },
      })

    const created = await sessionCreate(contextOne, privateTitle, `e2e-one-${runId}`)
    expect(created.ok()).toBe(true)
    const createdSession = (await created.json()) as { session: { id: string } }
    const createdTwo = await sessionCreate(contextTwo, sharedTitle, `e2e-two-${runId}`)
    expect(createdTwo.ok()).toBe(true)

    const pageOne = await contextOne.newPage()
    await pageOne.goto("/sessions?tab=recent")
    const conversationsOne = pageOne.getByRole("list", { name: "Active conversations" })
    await expect(conversationsOne.getByText(privateTitle)).toBeVisible()

    // The second member must render its own conversation list before the absence of the
    // first member's private session counts as isolation rather than an unrendered list.
    const pageTwo = await contextTwo.newPage()
    await pageTwo.goto("/sessions?tab=recent")
    await expect(pageTwo.getByLabel("Agent for a new session")).toBeEnabled()
    const conversationsTwo = pageTwo.getByRole("list", { name: "Active conversations" })
    await expect(conversationsTwo.getByText(sharedTitle)).toBeVisible()
    await expect(conversationsTwo.getByText(privateTitle)).toHaveCount(0)

    const foreignSession = await contextTwo.request.get(`${baseOrigin}/api/sessions/${createdSession.session.id}`)
    expect(foreignSession.status()).toBe(404)
  } finally {
    for (const context of contexts) await context.close()
    // Cleanup runs on the failure path too and must not replace the original
    // assertion error, so a cleanup failure is captured and only rethrown when
    // the test body itself succeeded.
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
