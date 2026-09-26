import type { Browser, BrowserContext } from "@playwright/test"
import { e2eExampleDataSeedForMember } from "../e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"

export async function asyncMarkdownRenderingSetup(browser: Browser, runId: string) {
  const issued = await e2eMemberSessionsIssue(runId)
  const [member] = issued.members
  const mapping = await e2eExampleDataSeedForMember({
    subject: `${issued.subjectPrefix}1`,
    userId: member.userId,
    runId,
  })
  const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const context: BrowserContext = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    {
      domain: new URL(baseOrigin).hostname,
      name: "__Host-codeline-session",
      path: "/",
      secure: true,
      value: member.token,
    },
  ])
  return { context, mapping }
}
