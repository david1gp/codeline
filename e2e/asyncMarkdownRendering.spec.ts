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
    const chatResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/sessions/") &&
        response.url().endsWith("/chat"),
    )
    await composer.getByRole("button", { name: "Send" }).click()
    const chatResponse = await chatResponsePromise
    expect(chatResponse.ok()).toBe(true)

    // The submitted message is rendered while it is still in flight and then keeps
    // that rendering once it is finalized. A deterministic run can settle before the
    // browser is sampled, so the message is located in whichever list currently
    // holds it instead of racing the in-flight window.
    const submittedMessage = page
      .locator('[aria-label="In-flight messages"] li, [aria-label="Finalized messages"] article')
      .filter({ hasText: "Browser worker Markdown" })
      .first()
    await expect(submittedMessage).toBeVisible({ timeout: syncTimeout })

    // The raw fallback is a transient pre-render state, so only its replacement by
    // worker-rendered HTML is asserted; the fallback itself may never be observed.
    const submittedHtml = submittedMessage.locator(
      ".markdown-content--message:not(.markdown-content--message-fallback)",
    )
    await expect(submittedHtml.locator("h1")).toBeVisible({ timeout: syncTimeout })
    await expect(submittedHtml.locator("h1")).toHaveText("Browser worker Markdown")
    await expect(submittedHtml.locator("strong")).toBeVisible({ timeout: syncTimeout })
    await expect(submittedHtml.locator("strong")).toHaveText("bold fallback")
    await expect(submittedMessage.locator(".markdown-content--message-fallback")).toHaveCount(0)

    const bundledWorker = await bundledWorkerPromise
    expect(bundledWorker.url()).toContain("markdownHtmlRender.worker")
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
