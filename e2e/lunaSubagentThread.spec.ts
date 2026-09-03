import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const sessionCookieName = "__Host-codeline-session"
const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const simulationAgentId = "example-agent-simulation-streaming"
const simulationSessionId = "example-session-simulation-streaming"
const syncTimeout = 120_000
const childInstruction = "Return the deterministic child answer exactly once."
const parentPrompt = `delegate:${childInstruction}`

type Delegation = { childAgentId?: string; childRunId: string }
type DelegationsResponse = { delegations: Delegation[] }

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function authorizedDelegationRead(context: BrowserContext): Promise<Delegation | undefined> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${simulationSessionId}/delegations`)
  expect(response.ok(), await response.text()).toBe(true)
  const { delegations } = (await response.json()) as DelegationsResponse
  return delegations.find((candidate) => candidate.childAgentId === simulationAgentId)
}

test("the deterministic simulation delegates and opens its completed child thread", async ({ browser }) => {
  test.setTimeout(180_000)
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    if (member === undefined) throw new Error("The E2E member fixture did not issue an owner account.")
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })
    const context = await memberContextOpen(browser, member.token)
    contexts.push(context)

    const page = await context.newPage()
    await page.goto("/simulate/streaming")
    await expect(page.getByRole("button", { name: "Stream view" })).toBeVisible({ timeout: syncTimeout })
    await page.getByRole("button", { name: "Stream view" }).click()

    const composer = page.getByRole("form", { name: "Chat composer" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    const messageInput = composer.getByLabel("Message")
    await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
    await messageInput.fill(parentPrompt)
    await composer.getByRole("button", { name: "Send" }).click()

    let durableDelegation: Delegation | undefined
    await expect
      .poll(
        async () => {
          durableDelegation = await authorizedDelegationRead(context)
          return durableDelegation?.childAgentId
        },
        {
          message: "The deterministic child delegation was not durably returned by the authorized API.",
          timeout: syncTimeout,
        },
      )
      .toBe(simulationAgentId)
    if (durableDelegation === undefined)
      throw new Error("The deterministic child delegation was not returned by the API.")

    await page.getByRole("button", { name: "Conversation view" }).click()
    const semanticActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    const delegationToolRow = semanticActivity.locator(
      `li[data-session-semantic-kind="tool"]:has(button[data-child-run-id="${durableDelegation.childRunId}"])`,
    )
    await expect(delegationToolRow).toHaveCount(1, { timeout: syncTimeout })
    const childButton = delegationToolRow.getByRole("button", { name: "Open child conversation", exact: true })
    await expect(childButton).toHaveCount(1, { timeout: syncTimeout })
    await expect(childButton).toBeVisible({ timeout: syncTimeout })
    await expect(childButton).toHaveAccessibleName("Open child conversation")
    await expect(childButton).toHaveAttribute("data-child-run-id", durableDelegation.childRunId)
    await childButton.click()

    const panel = page.locator("#workspace-right-panel")
    await expect(panel).toBeVisible({ timeout: syncTimeout })
    await expect(panel).toHaveAccessibleName("Subagent thread")
    await expect(panel.getByText("Subagent thread", { exact: true })).toBeVisible()
    await expect(
      panel.getByText("The deterministic workspace check is streaming. No provider connection is required.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: syncTimeout })
    const childStream = panel.getByRole("region", { name: "Subagent execution stream" })
    await expect(childStream).toBeVisible()
    await expect(childStream).toContainText("No live child stream is available.")

    const latestAnswer = page.getByRole("region", { name: "Latest agent answer", exact: true })
    await expect(latestAnswer).toHaveCount(1, { timeout: syncTimeout })
    await expect(latestAnswer.locator(".markdown-content--message")).toHaveText(/^ok$/, { timeout: syncTimeout })
  } finally {
    for (const context of contexts) {
      try {
        await context.close()
      } catch (error) {
        cleanupError ??= error
      }
    }
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError ??= error
    }
    try {
      await e2eExampleDataSeedRestore()
    } catch (error) {
      cleanupError ??= error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
