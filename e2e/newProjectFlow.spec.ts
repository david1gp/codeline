import { type Browser, type BrowserContext, expect, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRepositoryRoot } from "./e2eRepositoryRoot.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const sessionCookieName = "__Host-codeline-session"
const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const syncTimeout = 45_000
const deterministicAgentId = "example-agent-simulation-streaming"

async function memberContextOpen(browser: Browser, token: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: baseOrigin })
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
  return context
}

async function projectRegister(context: BrowserContext): Promise<void> {
  const response = await context.request.post(`${baseOrigin}/api/project/registry/register`, {
    data: { path: e2eRepositoryRoot },
    headers: { origin: baseOrigin },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

async function deterministicPrimaryAgentExpose(context: BrowserContext): Promise<void> {
  await context.route("**/api/servers/example-server-local/agents", async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as {
      agents: Array<{
        id: string
        name: string
        parentAgentId: string | null
        role: string
        serverId: string
      }>
    }
    const deterministicAgent = body.agents.find((agent) => agent.id === deterministicAgentId)
    if (deterministicAgent === undefined) throw new Error(`The seeded agent ${deterministicAgentId} is unavailable.`)
    body.agents = body.agents.map((agent) =>
      agent.id === deterministicAgentId ? { ...agent, parentAgentId: null, role: "primary" } : agent,
    )
    await route.fulfill({ response, json: body })
  })
}

async function userMessagesRead(context: BrowserContext, sessionId: string): Promise<string[]> {
  const response = await context.request.get(`${baseOrigin}/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  expect(response.ok(), await response.text()).toBe(true)
  const body = (await response.json()) as { messages: Array<{ content: string; role: string }> }
  return body.messages.filter((message) => message.role === "user").map((message) => message.content)
}

test("New Session navigates directly to the new-session workspace", async ({ browser }) => {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    // The helper issues two members, but this focused flow only needs the first one.
    const issued = await e2eMemberSessionsIssue(runId)
    const context = await memberContextOpen(browser, issued.members[0].token)
    contexts.push(context)

    const page = await context.newPage()
    await page.goto("/sessions?tab=projects")

    await page.getByRole("button", { name: "New Session", exact: true }).click()
    await expect(page).toHaveURL(/\/sessions\/new\?tab=projects$/)
    await expect(page.getByRole("dialog")).toHaveCount(0)

    await page.close()
  } finally {
    for (const context of contexts) await context.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})

test("the new-session project selector opens the New Project dialog after an empty search", async ({ browser }) => {
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const context = await memberContextOpen(browser, issued.members[0].token)
    contexts.push(context)

    const page = await context.newPage()
    await page.goto("/sessions/new")

    const selector = page.locator("#workspace-setup-project")
    const selectorTrigger = selector.getByRole("button", { name: /^Project:/ })
    await selectorTrigger.click()
    await page.getByLabel("Search projects").fill(`no-project-${runId}`)
    await expect(page.getByText("No projects match your search.", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "New Project", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "New Project" })
    await expect(dialog).toBeVisible()
    await page.waitForTimeout(250)
    await expect(dialog).toBeVisible()
    await expect(page.getByLabel("Search projects")).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(selectorTrigger).toBeFocused()

    await page.close()
  } finally {
    for (const context of contexts) await context.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})

test("creating a project session sends and persists exactly its first UI message", async ({ browser }) => {
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let exampleDataSeeded = false
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })
    exampleDataSeeded = true
    context = await memberContextOpen(browser, member.token)
    await deterministicPrimaryAgentExpose(context)
    await projectRegister(context)

    const page = await context.newPage()
    await page.goto("/sessions?tab=projects")
    await page.getByRole("button", { name: "New Session", exact: true }).click()
    await expect(page).toHaveURL(/\/sessions\/new\?tab=projects$/)

    const projectSelector = page.locator("#workspace-setup-project")
    await projectSelector.getByRole("button", { name: /^Project:/ }).click()
    const projectOption = page.getByRole("option", { name: "codeline", exact: true })
    await expect(projectOption).toBeVisible({ timeout: syncTimeout })
    await projectOption.click()

    const agentSelector = page.getByLabel("Agent for a new session")
    await expect(agentSelector).toBeEnabled({ timeout: syncTimeout })
    await agentSelector.selectOption(deterministicAgentId)
    await expect(agentSelector).toHaveValue(deterministicAgentId)

    const prompt = `first project message ${runId}`
    const composer = page.getByRole("form", { name: "Chat composer" })
    await composer.getByLabel("Message").fill(prompt)
    await composer.getByRole("button", { name: "Send", exact: true }).click()

    await expect(page).toHaveURL(/\/sessions\/(?!new(?:[/?]|$))[^/?]+(?:\?tab=projects)?$/, {
      timeout: syncTimeout,
    })
    const sessionId = new URL(page.url()).pathname.split("/").at(-1)
    if (sessionId === undefined || sessionId.length === 0) throw new Error("The created session URL has no session id.")

    await expect
      .poll(() => userMessagesRead(context as BrowserContext, sessionId), { timeout: syncTimeout })
      .toEqual([prompt])

    const persistedUserMessage = page
      .getByRole("list", { name: "Recent semantic activity", exact: true })
      .locator('li[data-session-message-role="user"]')
    await expect(persistedUserMessage).toHaveCount(1, { timeout: syncTimeout })
    await expect(persistedUserMessage).toContainText(prompt, { timeout: syncTimeout })

    await page.reload()
    await expect(persistedUserMessage).toHaveCount(1, { timeout: syncTimeout })
    await expect(persistedUserMessage).toContainText(prompt, { timeout: syncTimeout })
  } finally {
    await context?.close()
    try {
      deletedUserIds = await e2eMemberSessionsPurge(runId)
    } catch (error) {
      cleanupError = error
    }
    if (exampleDataSeeded) {
      try {
        await e2eExampleDataSeedRestore()
      } catch (error) {
        cleanupError ??= error
      }
    }
  }

  if (cleanupError !== undefined) throw cleanupError
  expect(deletedUserIds).toHaveLength(2)
})
