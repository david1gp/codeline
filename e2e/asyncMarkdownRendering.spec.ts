import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const syncTimeout = 45_000
const markdownPrompt = "# Browser worker Markdown\n\n**bold fallback**"

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

test("the managed preview renders submitted Markdown with the bundled worker", async ({ browser }) => {
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })
    const context = await memberContextOpen(browser, member.token)
    contexts.push(context)

    const page = await context.newPage()
    const bundledWorkerPromise = page.waitForEvent("worker", {
      predicate: (worker) => worker.url().includes("markdownHtmlRender.worker"),
    })
    await page.goto("/simulate/streaming")
    await expect(page.getByRole("form", { name: "Chat composer" })).toBeVisible({ timeout: syncTimeout })

    const composer = page.getByRole("form", { name: "Chat composer" })
    await composer.getByLabel("Message").fill(markdownPrompt)
    const chatRequestPromise = page.waitForRequest(
      (request) =>
        request.method() === "POST" && request.url().includes("/api/sessions/") && request.url().endsWith("/chat"),
    )
    const submittedRunIdPromise = chatRequestPromise.then((request) => {
      const requestBody = request.postDataJSON() as { runId?: unknown } | null
      if (typeof requestBody?.runId !== "string") throw new Error("Expected chat POST request body to include runId")
      return requestBody.runId
    })
    let releaseRunSnapshot: (() => void) | undefined
    const runSnapshotGate = new Promise<void>((resolve) => {
      releaseRunSnapshot = resolve
    })
    await page.route("**/api/sessions/*/runs/*/snapshot", async (route) => {
      const submittedRunId = await submittedRunIdPromise
      const snapshotPath = new URL(route.request().url()).pathname
      const relevantSnapshot =
        route.request().method() === "GET" && snapshotPath.endsWith(`/runs/${submittedRunId}/snapshot`)
      if (relevantSnapshot) await runSnapshotGate
      const response = await route.fetch()
      await route.fulfill({ response })
    })
    const chatResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/sessions/") &&
        response.url().endsWith("/chat"),
    )
    const inFlightMessages = page.getByRole("list", { name: "In-flight messages", exact: true })
    const submittedInFlightMessage = inFlightMessages
      .locator(":scope > li")
      .filter({ hasText: "Browser worker Markdown" })
      .first()
    try {
      await composer.getByRole("button", { name: "Send" }).click()
      const submittedRunId = await submittedRunIdPromise
      const chatResponse = await chatResponsePromise
      expect(chatResponse.ok()).toBe(true)
      expect(submittedRunId).toEqual(expect.any(String))

      await expect(submittedInFlightMessage).toBeVisible({ timeout: syncTimeout })

      // The raw fallback is a transient pre-render state, so only its replacement by
      // worker-rendered HTML is asserted; the fallback itself may never be observed.
      const submittedHtml = submittedInFlightMessage.locator(
        ".markdown-content--message:not(.markdown-content--message-fallback)",
      )
      await expect(submittedHtml.locator("h1")).toBeVisible({ timeout: syncTimeout })
      await expect(submittedHtml.locator("h1")).toHaveText("Browser worker Markdown")
      await expect(submittedHtml.locator("strong")).toBeVisible({ timeout: syncTimeout })
      await expect(submittedHtml.locator("strong")).toHaveText("bold fallback")
      await expect(submittedInFlightMessage.locator(".markdown-content--message-fallback")).toHaveCount(0)
    } finally {
      // Hold the request until the worker assertion above has observed the in-flight
      // message; this synchronizes on the UI state rather than an arbitrary delay.
      releaseRunSnapshot?.()

      const bundledWorker = await bundledWorkerPromise
      expect(bundledWorker.url()).toContain("markdownHtmlRender.worker")
    }

    const recentActivity = page.getByRole("list", { name: "Recent semantic activity", exact: true })
    const submittedRecentMessage = recentActivity
      .locator(':scope > li[data-session-message-role="user"]')
      .filter({ hasText: "Browser worker Markdown" })
      .first()
    await expect(submittedRecentMessage).toBeVisible({ timeout: syncTimeout })
    // Semantic history intentionally renders the lightweight summary as text, not
    // as the full Markdown document rendered in the in-flight message body.
    await expect(submittedRecentMessage.getByText(markdownPrompt, { exact: true })).toBeVisible({
      timeout: syncTimeout,
    })
    await expect(inFlightMessages).toHaveCount(0, { timeout: syncTimeout })
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
