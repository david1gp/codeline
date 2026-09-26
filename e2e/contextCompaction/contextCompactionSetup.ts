import type { Browser } from "@playwright/test"
import { e2eExampleDataSeedForMember } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"

export async function contextCompactionSetup(browser: Browser, runId: string) {
  const issued = await e2eMemberSessionsIssue(runId)
  const [member] = issued.members
  const mapping = await e2eExampleDataSeedForMember({
    subject: `${issued.subjectPrefix}1`,
    userId: member.userId,
    runId,
  })
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const context = await browser.newContext({ baseURL: origin })
  await context.addCookies([
    { domain: new URL(origin).hostname, name: "__Host-codeline-session", path: "/", secure: true, value: member.token },
  ])
  return { context, mapping }
}
