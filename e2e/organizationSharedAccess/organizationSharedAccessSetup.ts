import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { oidcEnvironmentConfigurationResolve } from "../../scripts/oidcEnvironmentConfigurationResolve.js"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"

export async function organizationSharedAccessSetup(
  browser: Browser,
  runId: string,
  contexts: BrowserContext[],
): Promise<void> {
  // Issuing is guarded by the caller's cleanup even if a later setup step fails.
  const oidcEnvironment = oidcEnvironmentConfigurationResolve(process.env)
  if (!oidcEnvironment.success) throw new Error(oidcEnvironment.errorMessage)
  const issued = await e2eMemberSessionsIssue(runId)
  expect(issued.organizationExternalId).toBe(oidcEnvironment.data.organizationExternalId)
  expect(issued.organizationId.length).toBeGreaterThan(0)
  expect(issued.subjectPrefix).toContain(runId)
  for (const member of issued.members) {
    const context = await browser.newContext({ baseURL: baseOrigin })
    contexts.push(context)
    await context.addCookies([
      {
        domain: new URL(baseOrigin).hostname,
        name: "__Host-codeline-session",
        path: "/",
        secure: true,
        value: member.token,
      },
    ])
  }
}
