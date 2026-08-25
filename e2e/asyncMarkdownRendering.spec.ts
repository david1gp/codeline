import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"
const syncTimeout = 45_000
const markdownPrompt = "# Browser worker Markdown\n\n**bold fallback**"
const streamedResponse = "The deterministic workspace check is streaming. No provider connection is required."

type MarkdownState = {
  fallback: boolean
  html: string
  text: string
}

declare global {
  interface Window {
    __codelineMarkdownStates?: MarkdownState[]
  }
}

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function markdownStateObserve(page: Page): Promise<void> {
  await page.evaluate(() => {
    const states: MarkdownState[] = []
    window.__codelineMarkdownStates = states
    const record = (element: Element) => {
      if (!element.matches(".markdown-content--message")) return
      states.push({
        fallback: element.classList.contains("markdown-content--message-fallback"),
        html: element.innerHTML,
        text: element.textContent ?? "",
      })
    }
    const scan = (node: Node) => {
      if (node instanceof Element) {
        record(node)
        for (const element of node.querySelectorAll(".markdown-content--message")) record(element)
      }
    }
    const observer = new MutationObserver((records) => {
      for (const mutation of records) {
        for (const node of mutation.addedNodes) scan(node)
        scan(mutation.target)
      }
    })
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true })
  })
}

async function markdownStatesRead(page: Page): Promise<MarkdownState[]> {
  return page.evaluate(() => window.__codelineMarkdownStates ?? [])
}

test("the bundled Markdown worker transitions streaming and finalized messages from source to HTML", async ({
  browser,
}) => {
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
    const workerUrls: string[] = []
    page.on("worker", (worker) => workerUrls.push(worker.url()))
    await page.goto("/simulate/streaming")
    await expect(page.getByRole("form", { name: "Chat composer" })).toBeVisible({ timeout: syncTimeout })
    await markdownStateObserve(page)

    const composer = page.getByRole("form", { name: "Chat composer" })
    await composer.getByLabel("Message").fill(markdownPrompt)
    await composer.getByRole("button", { name: "Send" }).click()

    const inFlight = page.getByRole("list", { name: "In-flight messages" })
    await expect(inFlight).toBeVisible({ timeout: syncTimeout })
    await expect
      .poll(
        async () => {
          const states = await markdownStatesRead(page)
          return states.some((state) => state.fallback && state.text === markdownPrompt)
        },
        { timeout: syncTimeout },
      )
      .toBe(true)
    await expect
      .poll(
        async () => {
          const states = await markdownStatesRead(page)
          return states.some((state) => !state.fallback && state.html.includes("<h1>Browser worker Markdown</h1>"))
        },
        { timeout: syncTimeout },
      )
      .toBe(true)
    await expect(inFlight.locator(".markdown-content--message-fallback")).toHaveCount(0)
    await expect(inFlight.locator("h1")).toHaveText("Browser worker Markdown")
    await expect(inFlight.locator("strong")).toHaveText("bold fallback")

    await expect.poll(() => workerUrls.length, { timeout: syncTimeout }).toBeGreaterThan(0)
    expect(workerUrls[0]).toContain("markdownHtmlRender.worker")

    const finalized = page.getByRole("list", { name: "Finalized messages" })
    const finalizedUser = finalized.locator('article[data-message-role="user"]')
    const finalizedAssistant = finalized.locator('article[data-message-role="assistant"]')
    await expect(finalizedUser.filter({ hasText: "Browser worker Markdown" })).toBeVisible({ timeout: syncTimeout })
    await expect(finalizedUser.locator(".markdown-content--message-fallback")).toHaveCount(0)
    await expect(finalizedUser.locator("h1")).toHaveText("Browser worker Markdown")
    await expect(finalizedUser.locator("strong")).toHaveText("bold fallback")
    await expect(finalizedAssistant).toContainText(streamedResponse, { timeout: syncTimeout })
    await expect(finalizedAssistant.locator(".markdown-content--message-fallback")).toHaveCount(0)
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
