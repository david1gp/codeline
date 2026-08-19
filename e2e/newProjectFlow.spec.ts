import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const sessionCookieName = "__Host-codeline-session"
const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

test("New Session then New project renames the action and opens project creation", async ({ browser }) => {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    // The helper issues two members, but this focused flow only needs the first one.
    const issued = await e2eMemberSessionsIssue(runId)
    const context = await memberContextOpen(browser, issued.members[0].token)
    contexts.push(context)

    const page = await context.newPage()
    await page.goto("/sessions?tab=recent")

    const dialog = page.getByRole("dialog")

    // Open the New Session dialog from the sidebar trigger.
    await page.getByRole("button", { name: "New Session", exact: true }).click()
    await expect(dialog).toBeVisible()
    const projectSelect = dialog.getByLabel("Project")
    await expect(projectSelect).toBeVisible()
    const primaryButton = dialog.getByRole("button", { name: "Start session" })
    await expect(primaryButton).toBeVisible()

    // Selecting "New project" only renames the primary action; the session step stays visible.
    await projectSelect.selectOption({ label: "New project" })
    const newProjectButton = dialog.getByRole("button", { name: "New Project" })
    await expect(newProjectButton).toBeVisible()
    await expect(projectSelect).toBeVisible()

    // Submitting the renamed action swaps the same dialog to the project-creation step.
    await newProjectButton.click()
    await expect(dialog.getByText("Select an existing folder. Codeline will not create a directory.")).toBeVisible()
    const folderInput = dialog.getByLabel("Folder path")
    await expect(folderInput).toBeVisible()
    await expect(dialog.getByRole("button", { name: "Use Project" })).toBeVisible()
    // The session step is no longer shown while the project step is active.
    await expect(projectSelect).toHaveCount(0)

    // Closing and reopening resets the single dialog back to the session step.
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await page.getByRole("button", { name: "New Session", exact: true }).click()
    await expect(page.getByRole("dialog").getByLabel("Project")).toBeVisible()

    await page.close()
  } finally {
    for (const context of contexts) await context.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
