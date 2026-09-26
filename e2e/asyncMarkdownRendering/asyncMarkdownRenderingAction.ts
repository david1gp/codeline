import { expect, type Page } from "@playwright/test"
import { asyncMarkdownWorkerAssert } from "./asyncMarkdownWorkerAssert.js"

export async function asyncMarkdownRenderingAction(page: Page, simulationSessionId: string | undefined) {
  const bundledWorkerPromise = page.waitForEvent("worker", {
    predicate: (worker) => worker.url().includes("markdownHtmlRender.worker"),
  })
  await page.goto(
    simulationSessionId === "example-session-simulation-streaming"
      ? "/simulate/streaming"
      : `/sessions/${simulationSessionId}`,
  )
  await expect(page.getByRole("form", { name: "Chat composer" })).toBeVisible({ timeout: 45_000 })

  const composer = page.getByRole("form", { name: "Chat composer" })
  const markdownPrompt = "# Browser worker Markdown\n\n**bold fallback**"
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
    const chatFailure = chatResponse.ok()
      ? ""
      : `Chat POST returned ${chatResponse.status()}: ${(await chatResponse.text()).slice(0, 512)}`
    expect(chatResponse.ok(), chatFailure).toBe(true)
    expect(submittedRunId).toEqual(expect.any(String))

    await asyncMarkdownWorkerAssert(submittedInFlightMessage)
  } finally {
    // Hold the request until the worker assertion above has observed the in-flight
    // message; this synchronizes on the UI state rather than an arbitrary delay.
    releaseRunSnapshot?.()

    const bundledWorker = await bundledWorkerPromise
    expect(bundledWorker.url()).toContain("markdownHtmlRender.worker")
  }
  return { inFlightMessages, markdownPrompt }
}
