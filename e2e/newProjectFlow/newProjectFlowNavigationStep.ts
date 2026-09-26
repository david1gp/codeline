import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { newProjectFlowCleanup } from "./newProjectFlowCleanup.js"
import { newProjectFlowMemberContextOpen } from "./newProjectFlowMemberContextOpen.js"

export async function newProjectFlowNavigationStep(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown
  try {
    // The helper issues two members, but this focused flow only needs the first one.
    const issued = await e2eMemberSessionsIssue(runId)
    const context = await newProjectFlowMemberContextOpen(browser, issued.members[0].token)
    contexts.push(context)
    const page = await context.newPage()
    await page.goto("/sessions?tab=projects")
    await page.getByRole("button", { name: "New Session", exact: true }).click()
    await expect(page).toHaveURL(/\/sessions\/new\?tab=projects$/)
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.close()
  } finally {
    try {
      deletedUserIds = await newProjectFlowCleanup(runId, contexts)
    } catch (error) {
      cleanupError = error
    }
  }
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
