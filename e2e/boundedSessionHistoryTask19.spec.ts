import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const settledSessionId = "example-session-active-1"

type SemanticStep = {
  childReference?: {
    childRunId: string
    childSessionId?: string | null
    delegationId: string
    parentSessionId: string
  }
  detailId?: string
  id: string
  kind: "input" | "message" | "run" | "tool"
  runId?: string
  status?: string
  terminalKind?: "cancelled" | "completed" | "failed" | "interrupted"
}

type BoundedSnapshot = {
  hasMore: boolean
  olderCursor: string | null
  semanticSteps: SemanticStep[]
  session: { id: string }
  state: { run: { runId: string; sessionId: string; status: string } | null }
  throughPosition: number
}

type BoundedHistoryPage = {
  hasMore: boolean
  nextCursor: string | null
  semanticSteps: SemanticStep[]
  throughPosition: number
}

type RunDetailResponse = {
  detail?: {
    run?: {
      cancellationKind: string | null
      failure: { code: string; message: string } | null
      id: string
      sessionId: string
      status: string
    }
    transcript?: {
      assistantText: string
      failure: { code: string; message: string } | null
      terminalOutcome: { status: string; failure?: { code: string; message: string } } | null
    }
    tools?: Array<{
      output?: string
      result?: string
      toolCallId: string
    }>
  }
  kind: string
}

type SeededTerminalOutcomeScenario = {
  expectedCancellationKind: "requested" | null
  expectedFailure: { code: string; message: string } | null
  expectedStatus: "aborted" | "failed" | "succeeded"
  expectedSummary: string
  runId: string
  sessionId: string
  terminalKind: "cancelled" | "completed" | "failed" | "interrupted"
}

const seededTerminalOutcomeScenarios: readonly SeededTerminalOutcomeScenario[] = [
  {
    expectedCancellationKind: null,
    expectedFailure: null,
    expectedStatus: "succeeded",
    expectedSummary: "Run completed",
    runId: "example-run-completed-2",
    sessionId: "example-session-active-1",
    terminalKind: "completed",
  },
  {
    expectedCancellationKind: null,
    expectedFailure: { code: "example_provider_failed", message: "The deterministic example provider failed." },
    expectedStatus: "failed",
    expectedSummary: "Run failed",
    runId: "example-run-failed-1",
    sessionId: "example-session-archived-1",
    terminalKind: "failed",
  },
  {
    expectedCancellationKind: "requested",
    expectedFailure: null,
    expectedStatus: "aborted",
    expectedSummary: "Run aborted",
    runId: "example-run-cancelled-1",
    sessionId: "example-session-remote-1",
    terminalKind: "cancelled",
  },
  {
    expectedCancellationKind: null,
    expectedFailure: { code: "chat_interrupted", message: "The API process stopped while the run was active." },
    expectedStatus: "aborted",
    expectedSummary: "Run aborted",
    runId: "example-run-interrupted-1",
    sessionId: "example-session-active-1",
    terminalKind: "interrupted",
  },
]

type SeededDelegationsResponse = {
  delegations: Array<{
    childRunId: string
    childSessionId: string | null
    delegationId: string
    id: string
    parentRunId: string
    parentSessionId: string
    task: string
  }>
}

type ToolDetailResponse = {
  detail?: {
    sessionId: string
    tool: {
      detailId: string
      output?: string
      result?: string
      toolCallId: string
      toolName?: string
    }
    runId: string
  }
  kind: string
}

async function memberSessionContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function fixturePromptAppend(page: Page, prompt: string): Promise<void> {
  const composer = page.getByRole("form", { name: "Chat composer" })
  const input = composer.getByLabel("Message")
  await expect(input).toBeEnabled({ timeout: 30_000 })
  await input.fill(prompt)
  await composer.getByRole("button", { name: "Send" }).click()
  await expect(page.getByRole("article").filter({ hasText: prompt })).toBeVisible({ timeout: 30_000 })
  await expect(input).toBeEnabled({ timeout: 30_000 })
}

test("bounded history loads one page, fixes older-page watermarks, and lazily loads details", async ({ browser }) => {
  test.setTimeout(240_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    if (member === undefined) throw new Error("The E2E member fixture did not issue an owner account.")
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })

    const context = await memberSessionContextOpen(browser, member.token)
    contexts.push(context)

    // The checked-in deterministic agent grows the seeded session before the measured
    // navigation, leaving more than one bounded page without a provider dependency.
    const setupPage = await context.newPage()
    await setupPage.goto(`/sessions/${settledSessionId}`)
    await expect(setupPage.getByRole("form", { name: "Chat composer" })).toBeVisible({ timeout: 30_000 })
    for (let index = 1; index <= 6; index += 1)
      await fixturePromptAppend(setupPage, `Task 19 bounded history prompt ${index} ${runId}`)
    await setupPage.close()

    const page = await context.newPage()
    const boundedSnapshotRequests: string[] = []
    const detailRequests: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.origin !== baseOrigin || !url.pathname.startsWith("/api/")) return
      if (url.pathname.endsWith("/bounded-snapshot")) boundedSnapshotRequests.push(url.toString())
      if (url.pathname.endsWith("/detail")) detailRequests.push(url.toString())
    })

    // A fresh browser navigation is bounded even though this session now has more
    // than 25 projected entries.
    const initialSnapshotResponsePromise = page.waitForResponse(
      (response) => {
        const url = new URL(response.url())
        return (
          response.request().method() === "GET" &&
          url.origin === baseOrigin &&
          url.pathname === `/api/sessions/${settledSessionId}/bounded-snapshot`
        )
      },
      { timeout: 30_000 },
    )
    await page.goto(`/sessions/${settledSessionId}`)
    const initialSnapshotResponse = await initialSnapshotResponsePromise
    expect(initialSnapshotResponse.status(), await initialSnapshotResponse.text()).toBe(200)
    const initialSnapshot = (await initialSnapshotResponse.json()) as BoundedSnapshot
    expect(initialSnapshot.session.id).toBe(settledSessionId)
    expect(initialSnapshot.semanticSteps).toHaveLength(25)
    expect(initialSnapshot.semanticSteps.length).toBeLessThanOrEqual(25)
    expect(initialSnapshot.hasMore).toBe(true)
    expect(initialSnapshot.olderCursor).toEqual(expect.any(String))
    expect(initialSnapshot.throughPosition).toBeGreaterThan(0)
    const recentActivity = page.getByRole("list", { name: "Recent semantic activity" })
    await expect(recentActivity.locator("li")).toHaveCount(25, { timeout: 30_000 })
    expect(boundedSnapshotRequests).toHaveLength(1)

    const olderCursor = initialSnapshot.olderCursor
    if (olderCursor === null) throw new Error("The bounded fixture session did not expose an older cursor.")
    const olderResponsePromise = page.waitForResponse(
      (response) => {
        const url = new URL(response.url())
        return (
          response.request().method() === "GET" &&
          url.origin === baseOrigin &&
          url.pathname === `/api/sessions/${settledSessionId}/bounded-history`
        )
      },
      { timeout: 30_000 },
    )
    await page.getByRole("main").getByRole("button", { name: "Load older activity", exact: true }).click()
    const olderResponse = await olderResponsePromise
    expect(olderResponse.status(), await olderResponse.text()).toBe(200)
    const olderPage = (await olderResponse.json()) as BoundedHistoryPage
    const olderRequestUrl = new URL(olderResponse.url())
    expect(olderRequestUrl.searchParams.get("cursor")).toBe(olderCursor)
    expect(olderRequestUrl.searchParams.get("limit")).toBe("25")
    expect(olderPage.semanticSteps.length).toBeLessThanOrEqual(25)
    expect(olderPage.throughPosition).toBe(initialSnapshot.throughPosition)
    await expect.poll(() => recentActivity.locator("li").count()).toBeGreaterThan(25)

    const loadedSemanticSteps = [...initialSnapshot.semanticSteps, ...olderPage.semanticSteps]
    const completedStep = loadedSemanticSteps.find(
      (step) => step.kind === "run" && step.detailId === "example-run-completed-2",
    )
    if (completedStep === undefined || completedStep.kind !== "run")
      throw new Error("The completed fixture run was not present in bounded history.")
    const completedRow = page.locator(`[data-session-history-entry-id="${completedStep.id}"]`)
    await expect(completedRow).toHaveCount(1)
    expect(detailRequests).toHaveLength(0)

    const runDetailUrl = `${baseOrigin}/api/sessions/${settledSessionId}/runs/example-run-completed-2/detail`
    const runDetailResponsePromise = page.waitForResponse((response) => response.url() === runDetailUrl, {
      timeout: 30_000,
    })
    await completedRow.locator("summary").click()
    const runDetailResponse = await runDetailResponsePromise
    expect(runDetailResponse.status(), await runDetailResponse.text()).toBe(200)
    const runDetail = (await runDetailResponse.json()) as RunDetailResponse
    expect(runDetail).toMatchObject({
      detail: {
        run: { id: "example-run-completed-2", sessionId: settledSessionId },
        tools: expect.arrayContaining([
          expect.objectContaining({
            output: "Searched the synchronized message records.",
            result: "Found the expected message records.",
            toolCallId: "example-tool-completed-search",
          }),
        ]),
      },
      kind: "finalized",
    })
    await expect(completedRow.locator("pre")).toContainText("Searched the synchronized message records.")
    expect(detailRequests).toEqual([runDetailUrl])

    const toolStep = loadedSemanticSteps.find(
      (step) =>
        step.kind === "tool" &&
        step.runId === "example-run-completed-2" &&
        step.detailId === "example-tool-completed-search",
    )
    if (toolStep === undefined || toolStep.kind !== "tool")
      throw new Error("The completed fixture tool was not present in bounded history.")
    const toolRow = page.locator(`[data-session-history-entry-id="${toolStep.id}"]`)
    await expect(toolRow).toHaveCount(1)

    const toolDetailUrl =
      `${baseOrigin}/api/sessions/${settledSessionId}/runs/example-run-completed-2/tools/` +
      "example-tool-completed-search/detail"
    const toolDetailResponsePromise = page.waitForResponse((response) => response.url() === toolDetailUrl, {
      timeout: 30_000,
    })
    await toolRow.locator("summary").click()
    const toolDetailResponse = await toolDetailResponsePromise
    expect(toolDetailResponse.status(), await toolDetailResponse.text()).toBe(200)
    const toolDetail = (await toolDetailResponse.json()) as ToolDetailResponse
    expect(toolDetail).toMatchObject({
      detail: {
        runId: "example-run-completed-2",
        sessionId: settledSessionId,
        tool: {
          detailId: "example-tool-completed-search",
          output: "Searched the synchronized message records.",
          result: "Found the expected message records.",
          toolCallId: "example-tool-completed-search",
          toolName: "search",
        },
      },
      kind: "finalized",
    })
    await expect(toolRow.locator("pre")).toContainText("Found the expected message records.")
    expect(detailRequests).toEqual([runDetailUrl, toolDetailUrl])

    await page.close()
  } finally {
    for (const context of contexts) await context.close()
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

test("seeded terminal outcomes stay exact and child navigation keeps its identity tuple", async ({ browser }) => {
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    if (member === undefined) throw new Error("The E2E member fixture did not issue an owner account.")
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })

    const context = await memberSessionContextOpen(browser, member.token)
    contexts.push(context)
    const page = await context.newPage()
    const boundedSnapshotRequests: string[] = []
    const delegationRequests: string[] = []
    const detailRequests: string[] = []
    page.on("request", (request) => {
      const url = new URL(request.url())
      if (url.origin !== baseOrigin || !url.pathname.startsWith("/api/")) return
      if (url.pathname.endsWith("/bounded-snapshot")) boundedSnapshotRequests.push(url.toString())
      if (url.pathname.endsWith("/delegations")) delegationRequests.push(url.toString())
      if (url.pathname.endsWith("/detail")) detailRequests.push(url.toString())
    })

    for (const scenario of seededTerminalOutcomeScenarios) {
      const snapshotUrl = `${baseOrigin}/api/sessions/${scenario.sessionId}/bounded-snapshot`
      const snapshotResponsePromise = page.waitForResponse(
        (response) => response.request().method() === "GET" && response.url() === snapshotUrl,
        { timeout: 30_000 },
      )
      await page.goto(`/sessions/${encodeURIComponent(scenario.sessionId)}`)
      const snapshotResponse = await snapshotResponsePromise
      expect(snapshotResponse.status(), await snapshotResponse.text()).toBe(200)
      const snapshot = (await snapshotResponse.json()) as BoundedSnapshot
      expect(snapshot.session.id).toBe(scenario.sessionId)
      expect(snapshot.state.run).toBeNull()

      const runStep = snapshot.semanticSteps.find((step) => step.kind === "run" && step.detailId === scenario.runId)
      if (runStep === undefined || runStep.kind !== "run")
        throw new Error(`The ${scenario.terminalKind} fixture run was not projected into bounded history.`)
      expect(runStep.status).toBe(scenario.expectedStatus)
      expect(runStep.terminalKind).toBe(scenario.terminalKind)

      const row = page.locator(`[data-session-history-entry-id="${runStep.id}"]`)
      await expect(row).toBeVisible({ timeout: 30_000 })
      await expect(row.locator("summary")).toContainText(scenario.expectedSummary)

      const detailUrl = `${baseOrigin}/api/sessions/${scenario.sessionId}/runs/${scenario.runId}/detail`
      const detailResponsePromise = page.waitForResponse(
        (response) => response.request().method() === "GET" && response.url() === detailUrl,
        { timeout: 30_000 },
      )
      await row.locator("summary").click()
      const detailResponse = await detailResponsePromise
      expect(detailResponse.status(), await detailResponse.text()).toBe(200)
      const detail = (await detailResponse.json()) as RunDetailResponse
      expect(detail).toMatchObject({
        detail: {
          run: {
            cancellationKind: scenario.expectedCancellationKind,
            failure: scenario.expectedFailure,
            id: scenario.runId,
            sessionId: scenario.sessionId,
            status: scenario.expectedStatus,
          },
        },
        kind: "finalized",
      })
      const transcriptStatus =
        scenario.terminalKind === "completed" ? "completed" : scenario.terminalKind === "failed" ? "failed" : "aborted"
      expect(detail.detail?.transcript?.terminalOutcome).toMatchObject({ status: transcriptStatus })
      expect(detail.detail?.transcript?.failure ?? null).toEqual(scenario.expectedFailure)
      await expect(row.locator("pre")).toContainText(`"status": "${scenario.expectedStatus}"`)
      if (scenario.expectedFailure !== null)
        await expect(row.locator("pre")).toContainText(scenario.expectedFailure.code)
      if (scenario.expectedCancellationKind !== null)
        await expect(row.locator("pre")).toContainText(scenario.expectedCancellationKind)
      expect(boundedSnapshotRequests).toContain(snapshotUrl)
      expect(detailRequests).toContain(detailUrl)
    }

    const parentSessionId = "example-session-active-1"
    const childRunId = "example-run-child-1"
    const delegationId = "example-delegation-1"
    const snapshotUrl = `${baseOrigin}/api/sessions/${parentSessionId}/bounded-snapshot`
    const delegationUrl = `${baseOrigin}/api/sessions/${parentSessionId}/delegations`
    const snapshotResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "GET" && response.url() === snapshotUrl,
      { timeout: 30_000 },
    )
    const delegationResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "GET" && response.url() === delegationUrl,
      { timeout: 30_000 },
    )
    await page.goto(`/sessions/${encodeURIComponent(parentSessionId)}`)
    const snapshotResponse = await snapshotResponsePromise
    const delegationResponse = await delegationResponsePromise
    expect(snapshotResponse.status(), await snapshotResponse.text()).toBe(200)
    expect(delegationResponse.status(), await delegationResponse.text()).toBe(200)
    const snapshot = (await snapshotResponse.json()) as BoundedSnapshot
    const delegations = (await delegationResponse.json()) as SeededDelegationsResponse
    const delegation = delegations.delegations.find((candidate) => candidate.id === delegationId)
    if (delegation === undefined) throw new Error("The delegated example fixture was not returned by the API.")
    expect(delegation).toMatchObject({
      childRunId,
      childSessionId: null,
      delegationId,
      parentRunId: "example-run-delegating-1",
      parentSessionId,
    })

    const childStep = snapshot.semanticSteps.find(
      (step) => step.kind === "tool" && step.childReference?.childRunId === childRunId,
    )
    if (childStep === undefined || childStep.kind !== "tool" || childStep.childReference === undefined)
      throw new Error("The delegated child fixture was not attached to a projected parent tool entry.")
    expect(childStep).toMatchObject({
      childReference: { childRunId, delegationId, parentSessionId },
      detailId: "example-delegation-tool",
      runId: "example-run-delegating-1",
    })

    const childRow = page.locator("li").filter({
      has: page.locator(`[data-session-history-entry-id="${childStep.id}"]`),
    })
    await expect(childRow).toBeVisible({ timeout: 30_000 })
    const childButton = childRow.getByRole("button", { name: "Open child conversation", exact: true })
    await expect(childButton).toHaveAttribute("data-child-run-id", childRunId)

    const childDetailUrl = `${baseOrigin}/api/sessions/${parentSessionId}/delegations/${delegationId}/runs/${childRunId}/detail`
    const childDetailResponsePromise = page.waitForResponse(
      (response) => response.request().method() === "GET" && response.url() === childDetailUrl,
      { timeout: 30_000 },
    )
    await childButton.click()
    const childDetailResponse = await childDetailResponsePromise
    expect(childDetailResponse.status(), await childDetailResponse.text()).toBe(200)
    const childDetail = (await childDetailResponse.json()) as RunDetailResponse
    expect(childDetail).toMatchObject({
      detail: {
        run: { id: childRunId, sessionId: parentSessionId, status: "succeeded" },
        transcript: { assistantText: "The delegated example task is complete." },
      },
      kind: "finalized",
    })

    const panel = page.locator("#workspace-right-panel")
    await expect(panel).toBeVisible({ timeout: 30_000 })
    const childConversation = panel.getByRole("region", { name: "Child conversation" })
    await expect(childConversation).toBeVisible()
    await expect(childConversation.locator(".markdown-content--message")).toHaveText(
      "The delegated example task is complete.",
    )
    expect(delegationRequests).toContain(delegationUrl)
    expect(detailRequests).toContain(childDetailUrl)
    expect(detailRequests).not.toContain(`${baseOrigin}/api/sessions/${parentSessionId}/runs/${childRunId}/detail`)
  } finally {
    for (const context of contexts) await context.close()
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
