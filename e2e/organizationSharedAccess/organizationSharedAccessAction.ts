import { type BrowserContext, expect } from "@playwright/test"
import { e2eSessionCreate } from "../e2eSessionCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"

export async function organizationSharedAccessAction(
  contextOne: BrowserContext,
  contextTwo: BrowserContext,
  runId: string,
) {
  const serversOne = await contextOne.request.get(`${baseOrigin}/api/servers`)
  const serversTwo = await contextTwo.request.get(`${baseOrigin}/api/servers`)
  expect(serversOne.status()).toBe(200)
  expect(serversTwo.status()).toBe(200)
  const serverListOne = (await serversOne.json()) as { servers: Array<{ id: string; name: string }> }
  const serverListTwo = (await serversTwo.json()) as { servers: Array<{ id: string; name: string }> }
  expect(serverListOne.servers.length).toBeGreaterThan(0)
  expect(serverListTwo.servers).toEqual(serverListOne.servers)

  const optionsRead = async (context: BrowserContext) => {
    const page = await context.newPage()
    await page.goto("/sessions?tab=recent")
    const agentSelect = page.getByLabel("Agent for a new session")
    await expect(agentSelect).toBeEnabled()
    const options = await agentSelect.locator("option").allTextContents()
    await page.close()
    return options
  }
  expect(await optionsRead(contextTwo)).toEqual(await optionsRead(contextOne))

  const firstServer = serverListOne.servers[0]
  if (firstServer === undefined) throw new Error("The organization exposes no server.")
  const agentResponse = await contextOne.request.get(`${baseOrigin}/api/servers/${firstServer.id}/agents`)
  const agentList = (await agentResponse.json()) as {
    agents: Array<{ id: string; parentAgentId: string | null; role: string }>
  }
  const primaryAgent = agentList.agents.find((agent) => agent.parentAgentId === null && agent.role === "primary")
  if (primaryAgent === undefined) throw new Error("The organization server exposes no primary agent.")

  const privateTitle = `Private session ${runId}`
  const sharedTitle = `Shared target session ${runId}`
  const created = await e2eSessionCreate(contextOne, baseOrigin, {
    clientRequestId: `e2e-one-${runId}`,
    primaryAgentId: primaryAgent.id,
    serverId: firstServer.id,
    title: privateTitle,
  })
  expect(created.ok()).toBe(true)
  const createdSession = (await created.json()) as { session: { id: string } }
  const createdTwo = await e2eSessionCreate(contextTwo, baseOrigin, {
    clientRequestId: `e2e-two-${runId}`,
    primaryAgentId: primaryAgent.id,
    serverId: firstServer.id,
    title: sharedTitle,
  })
  expect(createdTwo.ok()).toBe(true)
  return { createdSessionId: createdSession.session.id, privateTitle, sharedTitle }
}
