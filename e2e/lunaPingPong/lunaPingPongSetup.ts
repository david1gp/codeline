import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eSessionCreate } from "../e2eSessionCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const lunaAgentId = "luna-high"

export async function lunaPingPongSetup(browser: Browser, runId: string, contexts: BrowserContext[]): Promise<string> {
  const issued = await e2eMemberSessionsIssue(runId)
  const context = await browser.newContext({ baseURL: baseOrigin })
  contexts.push(context)
  await context.addCookies([
    {
      domain: new URL(baseOrigin).hostname,
      name: "__Host-codeline-session",
      path: "/",
      secure: true,
      value: issued.members[0].token,
    },
  ])
  const serversResponse = await context.request.get(`${baseOrigin}/api/servers`)
  if (!serversResponse.ok()) throw new Error(`GET /api/servers failed with status ${serversResponse.status()}.`)
  const serverList = (await serversResponse.json()) as { servers: Array<{ id: string; name: string }> }
  if (serverList.servers.length === 0) throw new Error("Seed required: GET /api/servers returned no servers.")

  let lunaServer: { id: string; name: string } | undefined
  for (const server of serverList.servers) {
    const agentsResponse = await context.request.get(`${baseOrigin}/api/servers/${server.id}/agents`)
    if (!agentsResponse.ok())
      throw new Error(`GET /api/servers/${server.id}/agents failed with status ${agentsResponse.status()}.`)
    const agentList = (await agentsResponse.json()) as { agents: Array<{ id: string }> }
    if (agentList.agents.some((agent) => agent.id === lunaAgentId)) {
      lunaServer = server
      break
    }
  }
  if (lunaServer === undefined)
    throw new Error("Seed required: no server from GET /api/servers exposes the luna-high agent.")

  const sessionResponse = await e2eSessionCreate(context, baseOrigin, {
    clientRequestId: `e2e-luna-${runId}`,
    primaryAgentId: lunaAgentId,
    serverId: lunaServer.id,
    title: `Luna ping pong ${runId}`,
  })
  expect(sessionResponse.ok()).toBe(true)
  const sessionBody = (await sessionResponse.json()) as { session: { id: string } }
  return sessionBody.session.id
}
