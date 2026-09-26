import { type Browser, type BrowserContext, expect } from "@playwright/test"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eCommandProjectIssue } from "../e2eCommandProjectIssue.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { e2eSessionCreate } from "../e2eSessionCreate.js"
import { chatCommandExpansionCleanup } from "./chatCommandExpansionCleanup.js"
import { chatCommandExpansionMemberContextOpen } from "./chatCommandExpansionMemberContextOpen.js"
import { chatCommandExpansionOverridesAssert } from "./chatCommandExpansionOverridesAssert.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const syncTimeout = 45_000
const scenarioAgentId = "example-agent-simulation-streaming"
const bashInterpolationMarker = "codeline-command-marker"

export async function chatCommandExpansionOverridesStep(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const projectPath = await e2eCommandProjectIssue(runId)
    context = await chatCommandExpansionMemberContextOpen(browser, issued.members[0].token)
    // The selection is resolved before creation and is immutable afterwards, so
    // enabling bash here is what makes interpolation executable for this session.
    const response = await e2eSessionCreate(
      context,
      baseOrigin,
      {
        serverId: "example-server-local",
        clientRequestId: `e2e-command-bash-${runId}`,
        executionSelection: {
          tools: {
            primary: { agentId: scenarioAgentId, tools: { bash: true, webfetch: false } },
            selectableSubagents: [{ agentId: "luna-high", tools: { bash: false, webfetch: false } }],
          },
          version: 1,
        },
        primaryAgentId: scenarioAgentId,
        title: `Command interpolation ${runId}`,
      },
      projectPath,
    )
    expect(response.ok(), await response.text()).toBe(true)
    const session = ((await response.json()) as { session: { id: string } }).session

    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(session.id)}`)
    const composer = page.getByRole("form", { name: "Chat composer" })
    const input = composer.getByLabel("Message")
    const send = composer.getByRole("button", { name: "Send" })
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    await expect(input).toBeEnabled({ timeout: syncTimeout })
    const draftSet = async (value: string) => {
      await input.fill("")
      await input.pressSequentially(value)
    }

    // With bash enabled the same draft is accepted rather than blocked.
    await draftSet("/git/status now")
    await expect(composer.getByRole("alert")).toHaveCount(0)
    await expect(send).toBeEnabled()
    await send.click()

    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    const activityEntryWithMessage = (message: string) => recentActivity.getByText(message, { exact: true })
    await expect(
      activityEntryWithMessage(`The interpolated marker is ${bashInterpolationMarker} for now.`),
    ).toBeVisible({ timeout: syncTimeout })

    // A subtask command runs through delegation and still persists its identity.
    await draftSet("/subtask check the marker")
    await send.click()
    await expect(activityEntryWithMessage("Handle check the marker as a delegated subtask.")).toBeVisible({
      timeout: syncTimeout,
    })

    // A model override is validated against the session agent before it runs.
    await draftSet("/simulate the model override")
    await send.click()
    await expect(activityEntryWithMessage("Simulate the model override.")).toBeVisible({ timeout: syncTimeout })

    await chatCommandExpansionOverridesAssert(context, session.id)
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
