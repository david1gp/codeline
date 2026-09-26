import type { Browser } from "@playwright/test"
import { e2eExampleDataSeedForMember } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"

export async function lunaSubagentThreadSetup(browser: Browser, runId: string) {
  const issued = await e2eMemberSessionsIssue(runId)
  const [member] = issued.members
  if (member === undefined) throw new Error("The E2E member fixture did not issue an owner account.")
  const mapping = await e2eExampleDataSeedForMember({
    subject: `${issued.subjectPrefix}1`,
    userId: member.userId,
    runId,
  })
  const simulationAgentId = mapping["agent:example-agent-simulation-streaming"]!
  const simulationSessionId = mapping["session:example-session-simulation-streaming"]!
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const context = await browser.newContext({ baseURL: origin })
  await context.addCookies([
    { domain: new URL(origin).hostname, name: "__Host-codeline-session", path: "/", secure: true, value: member.token },
  ])
  return { context, simulationAgentId, simulationSessionId }
}
