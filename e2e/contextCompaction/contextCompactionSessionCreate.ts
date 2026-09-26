import { type BrowserContext, expect } from "@playwright/test"
import type { E2eExampleDataMapping } from "../e2eExampleDataSeedForMember.js"
import { e2eSessionCreate } from "../e2eSessionCreate.js"

export async function contextCompactionSessionCreate(
  context: BrowserContext,
  runId: string,
  mapping: E2eExampleDataMapping,
): Promise<string> {
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const serverId = "example-server-local"
  const agentId = "example-agent-simulation-compaction-summary"
  const agentResponse = await context.request.get(
    `${origin}/api/servers/${mapping[`server:${serverId}`]}/agents/${mapping[`agent:${agentId}`]}`,
  )
  expect(agentResponse.ok(), await agentResponse.text()).toBe(true)
  const agentBody = (await agentResponse.json()) as {
    agent: { configuration: { model: string; provider: string }; id: string; serverId: string }
  }
  expect(agentBody.agent).toMatchObject({
    configuration: { model: "simulation-compaction-summary", provider: "deterministic" },
    id: mapping[`agent:${agentId}`],
    serverId: mapping[`server:${serverId}`],
  })
  const response = await e2eSessionCreate(context, origin, {
    clientRequestId: `e2e-compaction-${runId}`,
    primaryAgentId: mapping[`agent:${agentId}`],
    serverId: mapping[`server:${serverId}`],
    title: `Context compaction ${runId}`,
  })
  expect(response.ok(), await response.text()).toBe(true)
  const body = (await response.json()) as { session: { id: string; primaryAgentId: string; serverId: string } }
  expect(body.session).toMatchObject({
    primaryAgentId: mapping[`agent:${agentId}`],
    serverId: mapping[`server:${serverId}`],
  })
  return body.session.id
}
