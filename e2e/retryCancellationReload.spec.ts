import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"
import { e2eSessionCreate } from "./e2eSessionCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const serverId = "example-server-local"
const syncTimeout = 45_000

/**
 * Both checked-in reload scenarios keep a durable run provably open for several
 * seconds, so the browser can be torn down and rebuilt while the server still
 * owns the run. `retry-reload` additionally replaces its first, retryable
 * attempt, which is what makes attempt isolation observable after a reload.
 */
const retryScenario = {
  agentId: "example-agent-simulation-retry-reload",
  discardedText: "The discarded first attempt started.",
  finalText: "The retried attempt finished after the reload.",
  firstText: "The retried attempt started.",
} as const

const cancellationScenario = {
  agentId: "example-agent-simulation-cancellation",
  activeText: "The cancellable deterministic run is active.",
  delayedText: "This delayed step observes abort before continuing.",
} as const

const resourceScenario = {
  agentId: "example-agent-simulation-streaming",
  excludedSkillName: "review-docs",
  presetName: "review",
  subagentId: "luna-high",
} as const

type ActiveRunListResponse = { runs: Array<{ runId: string; status: string }> }
type ActiveRunSnapshotResponse = {
  lastCursor: string | null
  lastSequence: number
  partialText: string
  status: string
}
type RunSessionSnapshotResponse = {
  runs: Array<{ attempts: Array<{ ordinal: number; status: string }>; id: string; status: string }>
}

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function sessionCreate(context: BrowserContext, body: Record<string, unknown>): Promise<string> {
  const response = await e2eSessionCreate(context, baseOrigin, { serverId, ...body })
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { session: { id: string } }).session.id
}

async function activeRunsRead(context: BrowserContext, sessionId: string): Promise<ActiveRunListResponse> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/active-runs`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as ActiveRunListResponse
}

async function activeRunSnapshotRead(
  context: BrowserContext,
  sessionId: string,
  runId: string,
): Promise<ActiveRunSnapshotResponse> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/runs/${runId}/snapshot`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as ActiveRunSnapshotResponse
}

async function runSessionSnapshotRead(context: BrowserContext, sessionId: string): Promise<RunSessionSnapshotResponse> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/runs/snapshot`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as RunSessionSnapshotResponse
}

async function promptSubmit(page: Page, prompt: string): Promise<void> {
  const composer = page.getByRole("form", { name: "Chat composer" })
  await expect(composer).toBeVisible({ timeout: syncTimeout })
  const messageInput = composer.getByLabel("Message")
  await expect(messageInput).toBeEnabled({ timeout: syncTimeout })
  await messageInput.fill(prompt)
  await composer.getByRole("button", { name: "Send" }).click()
}

/** Waits until the session owns exactly one active run and returns its identifier. */
async function activeRunAwait(context: BrowserContext, sessionId: string): Promise<string> {
  await expect
    .poll(async () => (await activeRunsRead(context, sessionId)).runs.length, { timeout: syncTimeout })
    .toBe(1)
  const runId = (await activeRunsRead(context, sessionId)).runs[0]?.runId
  if (runId === undefined) throw new Error("The detached run was not registered.")
  return runId
}

test("a retryable attempt is replaced across a reload and only the authoritative attempt is finalized", async ({
  browser,
}) => {
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    context = await memberContextOpen(browser, issued.members[0].token)
    const sessionId = await sessionCreate(context, {
      clientRequestId: `e2e-retry-reload-${runId}`,
      primaryAgentId: retryScenario.agentId,
      title: `Retry reload ${runId}`,
    })

    const prompt = `retry reload ${runId}`
    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)
    await promptSubmit(page, prompt)

    // The first attempt has already failed retryably and the second attempt owns
    // the run by the time its opening fragment is persisted.
    const detachedRunId = await activeRunAwait(context, sessionId)
    await expect
      .poll(
        async () => (await activeRunSnapshotRead(context as BrowserContext, sessionId, detachedRunId)).partialText,
        {
          timeout: syncTimeout,
        },
      )
      .toContain(retryScenario.firstText)

    await page.reload()

    // Only a cancellation may stop a run, so the retried attempt survives the reload.
    const afterReload = await activeRunsRead(context, sessionId)
    expect(afterReload.runs.map((run) => run.runId)).toEqual([detachedRunId])
    expect(afterReload.runs[0]?.status).toBe("running")

    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    await expect(page.getByRole("region", { name: "Latest agent answer", exact: true })).toContainText(
      retryScenario.finalText,
      { timeout: syncTimeout },
    )
    await expect(recentActivity.getByText(retryScenario.discardedText)).toHaveCount(0)
    await expect(recentActivity.getByText(prompt, { exact: true })).toBeVisible({ timeout: syncTimeout })

    // One run, two attempts: the failed attempt stays recorded while the second
    // attempt is the authoritative, succeeded one.
    const snapshot = await runSessionSnapshotRead(context, sessionId)
    const run = snapshot.runs.find((candidate) => candidate.id === detachedRunId)
    expect(run?.status).toBe("succeeded")
    expect(run?.attempts.map((attempt) => `${attempt.ordinal}:${attempt.status}`)).toEqual(["1:failed", "2:succeeded"])
    expect((await activeRunsRead(context, sessionId)).runs).toEqual([])
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

test("a run cancelled from a reloaded tab settles as aborted without a finalized answer", async ({ browser }) => {
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    context = await memberContextOpen(browser, issued.members[0].token)
    const sessionId = await sessionCreate(context, {
      clientRequestId: `e2e-cancel-reload-${runId}`,
      primaryAgentId: cancellationScenario.agentId,
      title: `Cancellation reload ${runId}`,
    })

    const prompt = `cancel after reload ${runId}`
    const page = await context.newPage()
    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)
    await promptSubmit(page, prompt)

    const detachedRunId = await activeRunAwait(context, sessionId)
    await expect
      .poll(
        async () => (await activeRunSnapshotRead(context as BrowserContext, sessionId, detachedRunId)).partialText,
        {
          timeout: syncTimeout,
        },
      )
      .toContain(cancellationScenario.activeText)

    // The reloaded tab holds no client run state, so cancellation is issued for the
    // run the tab rediscovered over HTTP rather than for a locally remembered stream.
    await page.reload()
    await expect(page.getByRole("form", { name: "Chat composer" })).toBeVisible({ timeout: syncTimeout })
    const rediscovered = await activeRunsRead(context, sessionId)
    expect(rediscovered.runs.map((run) => run.runId)).toEqual([detachedRunId])

    const cancelled = await context.request.post(
      `${baseOrigin}/api/sessions/${sessionId}/runs/${detachedRunId}/cancel`,
      { data: {}, headers: { origin: baseOrigin } },
    )
    expect(cancelled.ok(), await cancelled.text()).toBe(true)
    expect(((await cancelled.json()) as { cancelledRunIds: string[] }).cancelledRunIds).toContain(detachedRunId)

    await expect
      .poll(async () => (await activeRunSnapshotRead(context as BrowserContext, sessionId, detachedRunId)).status, {
        timeout: syncTimeout,
      })
      .toBe("aborted")
    await expect
      .poll(async () => (await activeRunsRead(context as BrowserContext, sessionId)).runs.length, {
        timeout: syncTimeout,
      })
      .toBe(0)

    // The cancelled run produced no assistant turn, and the delayed fragment that
    // the abort preempted never reaches the conversation.
    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    await expect(recentActivity.getByText(prompt, { exact: true })).toBeVisible({ timeout: syncTimeout })
    await expect(page.getByRole("region", { name: "Latest agent answer", exact: true })).toHaveCount(0, {
      timeout: syncTimeout,
    })
    await expect(page.getByText(cancellationScenario.delayedText)).toHaveCount(0)
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

test("an existing session shows its immutable captured resource selection across a reload", async ({ browser }) => {
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    context = await memberContextOpen(browser, issued.members[0].token)
    // Resolved before creation and captured in the immutable manifest: the session
    // can never be reconfigured afterwards, only inspected.
    const sessionId = await sessionCreate(context, {
      clientRequestId: `e2e-resources-${runId}`,
      executionSelection: {
        tools: {
          primary: { agentId: resourceScenario.agentId, tools: { bash: true, webfetch: false } },
          selectableSubagents: [{ agentId: resourceScenario.subagentId, tools: { bash: false, webfetch: true } }],
        },
        version: 1,
      },
      primaryAgentId: resourceScenario.agentId,
      skillSelection: { presetName: resourceScenario.presetName },
      title: `Immutable resources ${runId}`,
    })

    const page = await context.newPage()
    const capturedAssert = async (): Promise<void> => {
      await page.locator("summary", { hasText: "Captured execution context" }).click()
      // The workspace can also host the still-mutable pre-session panel, so the
      // assertions are scoped to the opened session's own captured section.
      const panel = page.locator('section[aria-labelledby="selected-session-context-heading"]')
      await expect(panel.getByText("Captured when this session was created and cannot be changed.")).toBeVisible({
        timeout: syncTimeout,
      })

      const capturedSkills = panel.getByRole("list", { name: "Captured skills" })
      await expect(capturedSkills).toBeVisible({ timeout: syncTimeout })
      // The preset's exclusion is part of what was captured, not a live filter.
      await expect(capturedSkills.getByText(resourceScenario.excludedSkillName, { exact: false })).toHaveCount(0)
      await expect(panel.getByRole("list", { name: "Captured skill groups" })).toBeVisible()

      const capturedTools = panel.getByRole("list", { name: "Captured tools" })
      await expect(capturedTools.getByText(`${resourceScenario.agentId} · primary`, { exact: false })).toBeVisible()
      await expect(panel.getByRole("list", { name: "Captured instruction sources" })).toBeVisible()

      // No mutable affordance exists for a created session.
      await expect(panel.getByLabel("Skill preset")).toHaveCount(0)
      // Exact names: the captured lists are separate labels that would otherwise
      // match the mutable list names by substring.
      await expect(panel.getByRole("list", { name: "Skill folders", exact: true })).toHaveCount(0)
      await expect(panel.getByRole("list", { name: "Agent tools", exact: true })).toHaveCount(0)
      await expect(panel.getByRole("list", { name: "Effective skills", exact: true })).toHaveCount(0)
      // Digests and skill resource bundles are debugging noise, not captured inputs.
      await expect(panel.getByText("sha256-", { exact: false })).toHaveCount(0)
    }

    await page.goto(`/sessions/${encodeURIComponent(sessionId)}`)
    await capturedAssert()
    await page.reload()
    await capturedAssert()

    const detail = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}`)
    expect(detail.ok(), await detail.text()).toBe(true)
    const session = (
      (await detail.json()) as {
        session: {
          executionResources: {
            presetName: string | null
            skills: Array<{ name: string }>
            tools: { primary: { agentId: string; tools: string[] } }
          } | null
        }
      }
    ).session
    expect(session.executionResources?.presetName).toBe(resourceScenario.presetName)
    // The captured set contains the selected model-facing tools plus the internal
    // ones; the point is that the unselected `webfetch` was never captured.
    expect(session.executionResources?.tools.primary.agentId).toBe(resourceScenario.agentId)
    expect(session.executionResources?.tools.primary.tools).toContain("bash")
    expect(session.executionResources?.tools.primary.tools).not.toContain("webfetch")
    expect(session.executionResources?.skills.map(({ name }) => name)).not.toContain(resourceScenario.excludedSkillName)
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
