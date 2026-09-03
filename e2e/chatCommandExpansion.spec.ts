import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"
import { e2eSessionCreate } from "./e2eSessionCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const serverId = "example-server-local"
const syncTimeout = 45_000

/**
 * The deterministic simulation agent keeps command execution provider-free: the
 * assertions are about discovery, expansion, identity, and overrides, not about
 * a model's answer.
 */
const scenarioAgentId = "example-agent-simulation-streaming"
const scenarioText = "The deterministic workspace check is streaming."
/** Checked-in project commands under `.agents/commands/`. */
const commandNames = ["delegate-review", "git/status", "notes", "review", "simulate", "subtask", "summarize"] as const
const reviewTemplateDigest = "sha256-6db419f142eb972fa54772f28a3bde6bd30b0c6d2b05204e1280cd3c06992662"
const bashInterpolationMarker = "codeline-command-marker"

type SessionCreateResponse = { session: { id: string; metadata: unknown } }
type MessageListResponse = {
  messages: Array<{ content: string; metadata: unknown; role: string }>
}
type CommandMessageMetadata = {
  command: {
    argumentsText: string
    catalogDigest: string
    expandedUserText: string
    name: string
    overrides: { agent?: string; model?: string; subtask?: boolean }
    templateDigest: string
    version: number
  }
}

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function sessionCreate(
  context: BrowserContext,
  body: Record<string, unknown>,
): Promise<SessionCreateResponse["session"]> {
  const response = await e2eSessionCreate(context, baseOrigin, { serverId, ...body })
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as SessionCreateResponse).session
}

async function userMessagesRead(
  context: BrowserContext,
  sessionId: string,
): Promise<Array<{ content: string; metadata: CommandMessageMetadata }>> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/messages`)
  expect(response.ok(), await response.text()).toBe(true)
  const body = (await response.json()) as MessageListResponse
  return body.messages
    .filter((message) => message.role === "user")
    .map((message) => ({ content: message.content, metadata: message.metadata as CommandMessageMetadata }))
}

function composerOf(page: Page) {
  const composer = page.getByRole("form", { name: "Chat composer" })
  return {
    composer,
    input: composer.getByLabel("Message"),
    listbox: composer.getByRole("listbox", { name: "Slash commands" }),
    send: composer.getByRole("button", { name: "Send" }),
  }
}

/** Replaces the whole draft, because a slash command is parsed from its start. */
async function draftSet(input: ReturnType<typeof composerOf>["input"], value: string): Promise<void> {
  await input.fill("")
  await input.pressSequentially(value)
}

test("the composer discovers, previews, and submits project slash commands", async ({ browser }) => {
  test.setTimeout(240_000)
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    context = await memberContextOpen(browser, issued.members[0].token)

    const session = await sessionCreate(context, {
      clientRequestId: `e2e-command-${runId}`,
      primaryAgentId: scenarioAgentId,
      title: `Command expansion ${runId}`,
    })

    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(session.id)}`)
    const { composer, input, listbox, send } = composerOf(page)
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    await expect(input).toBeEnabled({ timeout: syncTimeout })

    // The catalog is scoped to the session's own project, not to whichever project
    // the sidebar happens to highlight, so no project switch is needed first.
    await draftSet(input, "/")
    await expect(listbox).toBeVisible({ timeout: syncTimeout })
    await expect(listbox.getByRole("option")).toHaveCount(commandNames.length)
    for (const name of commandNames) {
      await expect(listbox.getByRole("option", { name: new RegExp(`/${name}\\b`) })).toBeVisible()
    }

    // Prefix filtering narrows the list and the first match starts highlighted.
    await draftSet(input, "/rev")
    await expect(listbox.getByRole("option")).toHaveCount(2)
    const reviewOption = listbox.getByRole("option", { name: /\/review\b/ })
    await expect(reviewOption).toHaveAttribute("aria-selected", "true")
    // The textarea stays a textbox and points at the highlighted option instead.
    await expect(input).toHaveAttribute("aria-activedescendant", /-option-review$/)

    // Keyboard selection moves the highlight and Tab commits the highlighted name.
    await input.press("ArrowDown")
    await expect(listbox.getByRole("option", { name: /\/delegate-review\b/ })).toHaveAttribute("aria-selected", "true")
    await input.press("ArrowUp")
    await expect(reviewOption).toHaveAttribute("aria-selected", "true")
    await input.press("Tab")
    await expect(input).toHaveValue("/review ")

    // Escape dismisses the list for the current draft without clearing it.
    await draftSet(input, "/rev")
    await expect(listbox).toBeVisible()
    await input.press("Escape")
    await expect(listbox).toHaveCount(0)
    await expect(input).toHaveValue("/rev")

    // Pointer selection rewrites the draft and keeps the caret in the composer.
    await draftSet(input, "/sum")
    await listbox.getByRole("option", { name: /\/summarize\b/ }).click()
    await expect(input).toHaveValue("/summarize ")
    await expect(input).toBeFocused()

    // A complete name replaces the list with the deterministic detail preview.
    await draftSet(input, "/review src/index.ts naming")
    await expect(listbox).toHaveCount(0)
    const preview = composer.locator("div[aria-live='polite']").first()
    await expect(preview).toBeVisible()
    await expect(preview.locator("pre")).toHaveText("Review src/index.ts with a focus on naming.")
    await expect(preview.getByText(reviewTemplateDigest, { exact: true })).toBeVisible()
    await expect(preview.getByText("Placeholders: $1, $2", { exact: true })).toBeVisible()
    await expect(preview.getByText("project", { exact: true })).toBeVisible()

    // Quoted arguments are tokenized once, so the preview matches what is sent.
    await draftSet(input, '/review "src/a b.ts" "naming and style"')
    await expect(preview.locator("pre")).toHaveText("Review src/a b.ts with a focus on naming and style.")

    // A trailing positional placeholder absorbs the remaining arguments.
    await draftSet(input, "/review src/index.ts naming and style")
    await expect(preview.locator("pre")).toHaveText("Review src/index.ts with a focus on naming and style.")

    // A template without any placeholder appends the arguments implicitly.
    await draftSet(input, "/notes remember the digest")
    await expect(preview.locator("pre")).toHaveText("Record the session notes.\n\nremember the digest")

    // Metadata overrides are surfaced before anything is submitted.
    await draftSet(input, "/delegate-review src/index.ts")
    await expect(preview.getByText("runs as subtask", { exact: true })).toBeVisible()
    await expect(preview.getByText("agent luna-high", { exact: true })).toBeVisible()
    await draftSet(input, "/simulate the override")
    await expect(preview.getByText("model deterministic/simulation-streaming", { exact: true })).toBeVisible()

    // An unknown command is refused locally, before a run can be started.
    await draftSet(input, "/nosuchcommand x")
    await expect(composer.getByRole("alert")).toContainText(
      'The command "/nosuchcommand" could not be found in this project.',
    )
    await expect(send).toBeDisabled()

    // Interpolation requires the bash tool, which this session did not enable.
    await draftSet(input, "/git/status now")
    await expect(preview.getByText("runs bash interpolation", { exact: true })).toBeVisible()
    await expect(composer.getByRole("alert")).toContainText(
      "This command uses !`...` shell interpolation, which requires the bash tool to be enabled for the primary agent.",
    )
    await expect(send).toBeDisabled()

    // A multiline draft keeps its newline inside the arguments.
    await draftSet(input, "/summarize first")
    await input.press("Shift+Enter")
    await input.pressSequentially("second")
    await expect(preview.locator("pre")).toHaveText("Summarize the following notes: first\nsecond")

    // Submitting sends the expansion through the normal chat path.
    await draftSet(input, "/review src/index.ts naming")
    await send.click()

    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    await expect(recentActivity.getByText("Review src/index.ts with a focus on naming.", { exact: true })).toBeVisible({
      timeout: syncTimeout,
    })
    await expect(page.getByRole("region", { name: "Latest agent answer", exact: true })).toContainText(scenarioText, {
      timeout: syncTimeout,
    })
    // The composer is cleared, so the expansion is not resubmitted.
    await expect(input).toHaveValue("")

    // The persisted turn carries immutable command identity and template digest.
    const messages = await userMessagesRead(context, session.id)
    expect(messages).toHaveLength(1)
    const [persisted] = messages
    expect(persisted?.content).toBe("Review src/index.ts with a focus on naming.")
    expect(persisted?.metadata.command).toMatchObject({
      argumentsText: "src/index.ts naming",
      expandedUserText: "Review src/index.ts with a focus on naming.",
      name: "review",
      overrides: {},
      templateDigest: reviewTemplateDigest,
      version: 1,
    })
    expect(persisted?.metadata.command.catalogDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
  } finally {
    await context?.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})

test("enabled bash interpolation, subtask, and model overrides expand into the persisted turn", async ({ browser }) => {
  test.setTimeout(240_000)
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    context = await memberContextOpen(browser, issued.members[0].token)

    // The selection is resolved before creation and is immutable afterwards, so
    // enabling bash here is what makes interpolation executable for this session.
    const session = await sessionCreate(context, {
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
    })

    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(session.id)}`)
    const { composer, input, send } = composerOf(page)
    await expect(composer).toBeVisible({ timeout: syncTimeout })
    await expect(input).toBeEnabled({ timeout: syncTimeout })

    // With bash enabled the same draft is accepted rather than blocked.
    await draftSet(input, "/git/status now")
    await expect(composer.getByRole("alert")).toHaveCount(0)
    await expect(send).toBeEnabled()
    await send.click()

    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    const activityEntryWithMessage = (message: string) => recentActivity.getByText(message, { exact: true })
    await expect(
      activityEntryWithMessage(`The interpolated marker is ${bashInterpolationMarker} for now.`),
    ).toBeVisible({ timeout: syncTimeout })

    // A subtask command runs through delegation and still persists its identity.
    await draftSet(input, "/subtask check the marker")
    await send.click()
    await expect(activityEntryWithMessage("Handle check the marker as a delegated subtask.")).toBeVisible({
      timeout: syncTimeout,
    })

    // A model override is validated against the session agent before it runs.
    await draftSet(input, "/simulate the model override")
    await send.click()
    await expect(activityEntryWithMessage("Simulate the model override.")).toBeVisible({
      timeout: syncTimeout,
    })

    const messages = await userMessagesRead(context, session.id)
    const byName = new Map(messages.map((message) => [message.metadata.command.name, message]))
    expect([...byName.keys()].sort()).toEqual(["git/status", "simulate", "subtask"])
    // The interpolated output is persisted, never the executable template.
    expect(byName.get("git/status")?.metadata.command.expandedUserText).toBe(
      `The interpolated marker is ${bashInterpolationMarker} for now.`,
    )
    expect(byName.get("git/status")?.metadata.command.templateDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
    expect(byName.get("subtask")?.metadata.command.overrides).toMatchObject({ subtask: true })
    expect(byName.get("simulate")?.metadata.command.overrides).toMatchObject({
      model: "deterministic/simulation-streaming",
    })
  } finally {
    await context?.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})

test("a pre-session command creates its session and submits the expansion once", async ({ browser }) => {
  test.setTimeout(240_000)
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    context = await memberContextOpen(browser, issued.members[0].token)

    const page = await context.newPage()
    await page.goto("/sessions/new")

    // The pre-session composer's catalog follows the active project, so the
    // repository project is selected before the command is written.
    await page.getByRole("tab", { name: "Projects" }).click()
    await page.getByRole("button", { name: "New Project", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("Folder path").fill(e2eRepositoryRoot)
    await dialog.getByRole("button", { name: "Use Project" }).click()
    await expect(dialog).toHaveCount(0, { timeout: syncTimeout })

    // Only primary catalog agents are selectable as a new session's target, so the
    // pre-session flow uses the default one and asserts the submitted turn rather
    // than a model answer.
    await expect(page.getByLabel("Agent for a new session")).toBeEnabled({ timeout: syncTimeout })

    const { composer, input, listbox, send } = composerOf(page)
    await expect(composer).toBeVisible({ timeout: syncTimeout })

    // Autocomplete is available before any session exists.
    await draftSet(input, "/rev")
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
    const messages = await userMessagesRead(context, sessionId)
    // Exactly one turn: the expansion is not sent again after creation.
    expect(messages).toHaveLength(1)
    expect(messages[0]?.metadata.command).toMatchObject({
      argumentsText: "src/index.ts naming",
      name: "review",
      templateDigest: reviewTemplateDigest,
      version: 1,
    })
  } finally {
    await context?.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
