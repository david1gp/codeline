import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const requestedProjectNotFoundMessage = "The requested project was not found."

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

test("signed-in pinned sessions landing does not report a missing project", async ({ browser }) => {
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    const mapping = await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId, runId })

    context = await memberContextOpen(browser, member.token)
    const page = await context.newPage()
    await page.goto("/sessions?tab=pinned")

    await expect(page).toHaveURL(/\/sessions\?tab=pinned$/)
    await expect(page.getByRole("tab", { name: "Pinned" })).toHaveAttribute("aria-selected", "true")
    const conversations = page.getByRole("list", { name: "Active conversations" })
    await expect(conversations.getByText("Build the workspace shell")).toBeVisible()
    const pinned = await context.request.get(`${baseOrigin}/api/sessions/${mapping["session:example-session-active-1"]}`)
    expect(pinned.ok(), await pinned.text()).toBe(true)
    expect((await pinned.json()) as { session: { id: string } }).toMatchObject({
      session: { id: mapping["session:example-session-active-1"] },
    })
    await expect(page.getByText(requestedProjectNotFoundMessage, { exact: true })).toHaveCount(0)

    await page.close()
  } finally {
    await context?.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
      await e2eExampleDataSeedRestore()
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
