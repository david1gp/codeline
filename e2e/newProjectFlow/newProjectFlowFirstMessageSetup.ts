import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { e2eExampleDataSeedForMember } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eRepositoryRoot } from "../e2eRepositoryRoot.js"
import { newProjectFlowMemberContextOpen } from "./newProjectFlowMemberContextOpen.js"

export async function newProjectFlowFirstMessageSetup(
  browser: Browser,
  runId: string,
  onSeeded: () => void,
  onContext: (context: BrowserContext) => void,
): Promise<{ context: BrowserContext; agentId: string; serverId: string }> {
  const issued = await e2eMemberSessionsIssue(runId)
  const [member] = issued.members
  const mapping = await e2eExampleDataSeedForMember({
    subject: `${issued.subjectPrefix}1`,
    userId: member.userId,
    runId,
  })
  onSeeded()
  const context = await newProjectFlowMemberContextOpen(browser, member.token)
  onContext(context)
  const agentId = mapping["agent:example-agent-simulation-streaming"]!
  const serverId = mapping["server:example-server-local"]!
  await context.route(`**/api/servers/${serverId}/agents`, async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as {
      agents: Array<{ id: string; name: string; parentAgentId: string | null; role: string; serverId: string }>
    }
    const deterministicAgent = body.agents.find((agent) => agent.id === agentId)
    if (deterministicAgent === undefined) throw new Error(`The seeded agent ${agentId} is unavailable.`)
    body.agents = body.agents.map((agent) =>
      agent.id === agentId ? { ...agent, parentAgentId: null, role: "primary" } : agent,
    )
    await route.fulfill({ response, json: body })
  })
  const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const response = await context.request.post(`${baseOrigin}/api/project/registry/register`, {
    data: { path: e2eRepositoryRoot },
    headers: { origin: baseOrigin },
  })
  expect(response.ok(), await response.text()).toBe(true)
  return { context, agentId, serverId }
}
