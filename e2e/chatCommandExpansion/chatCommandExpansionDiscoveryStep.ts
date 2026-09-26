import { type Browser, type BrowserContext, expect, type Page } from "@playwright/test"
import { e2eMemberSessionsIssue } from "../e2eMemberSessionsIssue.js"
import { e2eCommandProjectIssue } from "../e2eCommandProjectIssue.js"
import { e2eRunIdCreate } from "../e2eRunIdCreate.js"
import { e2eSessionCreate } from "../e2eSessionCreate.js"
import { chatCommandExpansionCleanup } from "./chatCommandExpansionCleanup.js"
import { chatCommandExpansionMemberContextOpen } from "./chatCommandExpansionMemberContextOpen.js"
import { chatCommandExpansionDiscoveryAssert } from "./chatCommandExpansionDiscoveryAssert.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
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

type SessionCreateResponse = { session: { id: string; metadata: unknown } }
async function sessionCreate(
  context: BrowserContext,
  body: Record<string, unknown>,
  projectPath: string,
): Promise<SessionCreateResponse["session"]> {
  const response = await e2eSessionCreate(context, baseOrigin, { serverId, ...body }, projectPath)
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as SessionCreateResponse).session
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

export async function chatCommandExpansionDiscoveryStep(browser: Browser): Promise<void> {
  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const projectPath = await e2eCommandProjectIssue(runId)
    context = await chatCommandExpansionMemberContextOpen(browser, issued.members[0].token)

    const session = await sessionCreate(
      context,
      {
        clientRequestId: `e2e-command-${runId}`,
        primaryAgentId: scenarioAgentId,
        title: `Command expansion ${runId}`,
      },
      projectPath,
    )

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
    await expect(page.getByRole("region", { name: "Response", exact: true })).toContainText(scenarioText, {
      timeout: syncTimeout,
    })
    await expect(composer.getByRole("status")).toHaveText("Response complete.", { timeout: syncTimeout })
    // The composer is cleared, so the expansion is not resubmitted.
    await expect(input).toHaveValue("")

    // The persisted turn carries immutable command identity and template digest.
    await chatCommandExpansionDiscoveryAssert(context, session.id)
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
