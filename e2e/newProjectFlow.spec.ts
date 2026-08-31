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

test("New Session navigates directly to the new-session workspace", async ({ browser }) => {
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
    await page.goto("/sessions?tab=projects")

    await page.getByRole("button", { name: "New Session", exact: true }).click()
    await expect(page).toHaveURL(/\/sessions\/new\?tab=projects$/)
    await expect(page.getByRole("dialog")).toHaveCount(0)

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

test("the new-session project selector opens the New Project dialog after an empty search", async ({ browser }) => {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const context = await memberContextOpen(browser, issued.members[0].token)
    contexts.push(context)

    const page = await context.newPage()
    await page.goto("/sessions/new")

    const selector = page.locator("#workspace-setup-project")
    const selectorTrigger = selector.getByRole("button", { name: /^Project:/ })
    await selectorTrigger.click()
    await page.getByLabel("Search projects").fill(`no-project-${runId}`)
    await expect(page.getByText("No projects match your search.", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "New Project", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "New Project" })
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(250)
    await expect(dialog).toBeVisible()
    await expect(page.getByLabel("Search projects")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(selectorTrigger).toBeFocused()

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
