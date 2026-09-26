import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { newProjectFlowCleanup } from "./newProjectFlowCleanup.js"
import { newProjectFlowMemberContextOpen } from "./newProjectFlowMemberContextOpen.js"

export async function newProjectFlowSelectorStep(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown
  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const context = await newProjectFlowMemberContextOpen(browser, issued.members[0].token)
    contexts.push(context)
    const page = await context.newPage()
    await page.goto("/sessions/new")
    const selector = page.locator("#workspace-setup-project")
    const selectorTrigger = selector.getByRole("button", { name: /^Project:/ })
    const projectSearch = page.getByRole("combobox", { name: "Registered projects", exact: true })
    await selectorTrigger.click()
    await projectSearch.fill(`no-project-${runId}`)
    await expect(page.getByText("No projects match your search.", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "New Project", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "New Project" })
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(250)
    await expect(dialog).toBeVisible()
    await expect(projectSearch).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(selectorTrigger).toBeFocused()
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
