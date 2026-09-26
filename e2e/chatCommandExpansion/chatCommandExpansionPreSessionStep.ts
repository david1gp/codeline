import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eCommandProjectIssue } from "../e2eCommandProjectIssue.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { chatCommandExpansionCleanup } from "./chatCommandExpansionCleanup.js"
import { chatCommandExpansionMemberContextOpen } from "./chatCommandExpansionMemberContextOpen.js"
import { chatCommandExpansionPreSessionAssert } from "./chatCommandExpansionPreSessionAssert.js"

const syncTimeout = 45_000

export async function chatCommandExpansionPreSessionStep(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown
  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const projectPath = await e2eCommandProjectIssue(runId)
    context = await chatCommandExpansionMemberContextOpen(browser, issued.members[0].token)
    const page = await context.newPage()
    await page.goto("/sessions/new")
    // The pre-session composer's catalog follows the active project, so the
    // run-owned command project is selected before the command is written.
    await page.getByRole("button", { name: "Project: Select a project…" }).click()
    await page.getByRole("button", { name: "New Project", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Folder path").fill(projectPath)
    await dialog.getByRole("button", { name: "Use Project" }).click()
    await expect(dialog).toHaveCount(0, { timeout: syncTimeout })
    // Only primary catalog agents are selectable as a new session's target, so the
    // pre-session flow uses the default one and asserts the submitted turn rather
    // than a model answer.
    await expect(page.getByLabel("Agent for a new session")).toBeEnabled({ timeout: syncTimeout })
    await page.getByRole("textbox", { name: "Model", exact: true }).fill("codex-lb/gpt-5.6-luna")

    const composer = page.getByRole("form", { name: "Chat composer" })
    const input = composer.getByLabel("Message")
    const listbox = composer.getByRole("listbox", { name: "Slash commands" })
    const send = composer.getByRole("button", { name: "Send" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    // Autocomplete is available before any session exists.
    await input.fill("")
    await input.pressSequentially("/rev")
    await expect(listbox.getByRole("option", { name: /\/review\b/ })).toBeVisible({ timeout: syncTimeout })
    await input.press("Tab")
    await expect(input).toHaveValue("/review ")
    await input.pressSequentially("src/index.ts naming")
    await send.click()

    // Creation, readiness, and submission all happen from the one action.
    await expect(page).toHaveURL(/\/sessions\/(?!new)[^/?]+/, { timeout: syncTimeout })
    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    await expect(recentActivity.getByText("Review src/index.ts with a focus on naming.", { exact: true })).toBeVisible({
      timeout: syncTimeout,
    })
    const sessionId = new URL(page.url()).pathname.split("/").filter((segment) => segment.length > 0)[1] ?? ""
    expect(sessionId.length).toBeGreaterThan(0)
    await chatCommandExpansionPreSessionAssert(context, sessionId)
  } finally {
    await context?.close()
    try {
      deletedUserIds = await chatCommandExpansionCleanup(runId)
    } catch (error) {
      cleanupError = error
    }
  }
  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
}
