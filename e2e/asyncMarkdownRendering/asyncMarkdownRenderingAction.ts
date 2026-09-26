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
  const chatResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/sessions/") &&
      response.url().endsWith("/chat"),
  )
  // The server assigns the snapshot run ID; the POST body's client run ID is different.
  const submittedRunIdPromise = chatResponsePromise.then(async (response) => {
    if (!response.ok()) return undefined
    const body = (await response.json()) as { runId?: unknown } | null
    if (typeof body?.runId !== "string") throw new Error("Expected chat POST response body to include runId")
    return body.runId
  })
  let releaseRunSnapshot: (() => void) | undefined
  const runSnapshotGate = new Promise<void>((resolve) => {
    releaseRunSnapshot = resolve
  })
  await page.route("**/api/sessions/*/runs/*/snapshot", async (route) => {
    const submittedRunId = await submittedRunIdPromise
    const snapshotPath = new URL(route.request().url()).pathname
    const relevantSnapshot =
      submittedRunId !== undefined &&
      route.request().method() === "GET" &&
      snapshotPath.endsWith(`/runs/${submittedRunId}/snapshot`)
    if (relevantSnapshot) await runSnapshotGate
    const response = await route.fetch()
    await route.fulfill({ response })
  })
  const inFlightMessages = page.getByRole("list", { name: "In-flight messages", exact: true })
  const submittedInFlightMessage = inFlightMessages
    .locator(":scope > li")
    .filter({ hasText: "Browser worker Markdown" })
    .first()
  try {
    await composer.getByRole("button", { name: "Send" }).click()
    const chatResponse = await chatResponsePromise
    const chatFailure = chatResponse.ok()
      ? ""
      : `Chat POST returned ${chatResponse.status()}: ${(await chatResponse.text()).slice(0, 512)}`
    expect(chatResponse.ok(), chatFailure).toBe(true)
    const submittedRunId = await submittedRunIdPromise
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
