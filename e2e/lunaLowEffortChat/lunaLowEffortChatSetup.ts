import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eSessionCreate } from "../e2eSessionCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const lunaAgentId = "luna-high"

export async function lunaLowEffortChatSetup(browser: Browser, runId: string) {
  const issued = await e2eMemberSessionsIssue(runId)
  const context = await browser.newContext({ baseURL: baseOrigin })
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
  return { context, sessionId: sessionBody.session.id }
}
