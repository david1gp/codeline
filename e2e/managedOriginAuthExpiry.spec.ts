import { type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsExpire } from "./e2eMemberSessionsExpire.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const sessionCookieName = "__Host-codeline-session"

const settledSessionId = "example-session-active-1"
const settledSessionTitle = "Build the workspace shell"
const settledUserMessage = "Create a focused workspace shell for local development."

const signedOutNotice = /Signed out\./

function sessionBody(page: Page) {
  return page.getByRole("main")
}

function semanticHistory(page: Page) {
  return sessionBody(page)
    .getByRole("region", { name: "Recent activity", exact: true })
    .getByRole("list", { name: "Recent semantic activity", exact: true })
}

function readOnlyNotice(page: Page) {
  return page.locator("[data-session-read-only='true']")
}

/**
 * Opens `/api/events` from the page so the request carries the very cookie jar
 * the live feed reconnects with, and reports the status the browser observed.
 */
async function eventFeedStatusRead(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const controller = new AbortController()
    const response = await fetch("/api/events", {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    })
    const reader = response.body?.getReader()
    if (reader !== undefined) {
      if (response.ok) await reader.read()
      await reader.cancel()
    }
    controller.abort()
    return response.status
  })
}

test("an expired identity session severs the event feed and signs the workspace out", async ({ browser }) => {
  // Deterministic re-seeding, a full workspace render, and a feed recycle exceed
  // the default budget.
  test.setTimeout(180_000)
  expect(baseOrigin).toBe("https://preview.codeline.work")

  const runId = e2eRunIdCreate()
  let context: BrowserContext | undefined
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [member] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: member.userId })

    context = await browser.newContext({ baseURL: baseOrigin })
    await context.addCookies([
      { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: member.token },
    ])
    const page = await context.newPage()

    // Authenticated baseline: the workspace renders the member's own data and
    // every mutation surface is live, so a later withdrawal is meaningful.
    await page.goto(`/sessions/${settledSessionId}`)
    await expect(page.getByText(settledSessionTitle, { exact: true }).first()).toBeVisible()
    await expect(semanticHistory(page).getByText(settledUserMessage, { exact: true })).toBeVisible()
    await expect(readOnlyNotice(page)).toHaveCount(0)
    await expect(page.getByRole("button", { name: `Rename ${settledSessionTitle}` })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled()

    // The feed is reachable while the identity session is valid.
    expect(await eventFeedStatusRead(page)).toBe(200)

    // Age the identity out through the repository-owned expiry action.
    const expiredSessions = await e2eMemberSessionsExpire(runId, member.userId)
    expect(expiredSessions.length).toBeGreaterThan(0)
    for (const expiredSession of expiredSessions) {
      expect(Date.parse(expiredSession.expiresAt)).toBeLessThan(Date.now())
    }

    // A reconnect with the expired cookie is rejected, and so is every other
    // authenticated read.
    expect(await eventFeedStatusRead(page)).toBe(401)
    const snapshot = await context.request.get(`${baseOrigin}/api/sessions/${settledSessionId}/bounded-snapshot`)
    expect(snapshot.status()).toBe(401)

    // Sever and recycle the live feed through the application's own offline and
    // online transitions. The reopened connection is the first one to meet the
    // expired identity, so the 401 must reach the client as a sign-out.
    await context.setOffline(true)
    await context.setOffline(false)

    await expect(readOnlyNotice(page)).toHaveText(signedOutNotice, { timeout: 30_000 })

    // Signed out withdraws every authenticated surface. The cached settled
    // transcript stays readable, which is the documented signed-out behavior.
    const composer = page.getByRole("textbox", { name: "Message" })
    await expect(composer).toBeDisabled()
    await expect(composer).toHaveAttribute("placeholder", "Read-only. Sending is unavailable.")
    await expect(page.getByRole("button", { name: `Rename ${settledSessionTitle}` })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Pin session" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Unpin session" })).toHaveCount(0)

    // No authenticated shell survives anywhere: an account-agnostic route falls
    // back to the provider selection page rather than any retained identity.
    await page.goto("/")
    const login = page.getByRole("main")
    await expect(login.getByRole("heading", { name: "Sign in to Codeline", exact: true })).toBeVisible()
    await expect(login.getByRole("link", { name: "Continue with Authworks SSO", exact: true })).toBeVisible()
    await expect(login.getByRole("link", { name: "Continue with Zitadel SSO", exact: true })).toBeVisible()
    await expect(login.getByRole("heading", { name: "Dashboard", exact: true })).toHaveCount(0)

    await page.close()
  } finally {
    await context?.close()
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
