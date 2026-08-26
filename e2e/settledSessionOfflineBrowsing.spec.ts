import { type BrowserContext, expect, type Page, test } from "@playwright/test"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const sessionCookieName = "__Host-codeline-session"
const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const settledDatabaseName = "codeline-settled-sessions"
const lastActiveAccountStorageKey = "codeline-last-active-account"

const cachedSessionId = "example-session-active-1"
const cachedSessionTitle = "Build the workspace shell"
const cachedUserMessage = "Create a focused workspace shell for local development."
const cachedAssistantMessage = "The workspace shell is ready for local sessions."
const otherSessionTitle = "Verify synchronized messages"

const signedOutNotice = /Signed out\./
const offlineNotice = /Offline\./

async function sessionCookieSet(context: BrowserContext, token: string): Promise<void> {
  await context.clearCookies()
  await context.addCookies([
    { domain: new URL(baseOrigin).hostname, name: sessionCookieName, path: "/", secure: true, value: token },
  ])
}

/** Reads the device-local settled records the application itself wrote. */
async function settledRecordsRead(page: Page, databaseName: string): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async (name) => {
    const opened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!opened.objectStoreNames.contains("settledSessions")) return []
      const store = opened.transaction("settledSessions", "readonly").objectStore("settledSessions")
      const records = await new Promise<unknown[]>((resolve, reject) => {
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result as unknown[])
        request.onerror = () => reject(request.error)
      })
      return records as Array<Record<string, unknown>>
    } finally {
      opened.close()
    }
  }, databaseName)
}

function sessionBody(page: Page) {
  return page.getByRole("main")
}

function readOnlyNotice(page: Page) {
  return page.locator("[data-session-read-only='true']")
}

async function cachedSessionExpectRendered(page: Page): Promise<void> {
  await expect(page.getByText(cachedSessionTitle).first()).toBeVisible()
  await expect(sessionBody(page).getByText(cachedUserMessage)).toBeVisible()
  await expect(sessionBody(page).getByText(cachedAssistantMessage)).toBeVisible()
}

test("a settled session cached while signed in stays readable signed out and offline", async ({ browser }) => {
  // Deterministic re-seeding and several full navigations exceed the default budget.
  test.setTimeout(180_000)
  const runId = e2eRunIdCreate()
  const contexts: BrowserContext[] = []
  let deletedUserIds: string[] = []
  let cleanupError: unknown

  try {
    const issued = await e2eMemberSessionsIssue(runId)
    const [owner, otherAccount] = issued.members
    await e2eExampleDataSeedForMember({ subject: `${issued.subjectPrefix}1`, userId: owner.userId })

    const context = await browser.newContext({ baseURL: baseOrigin })
    contexts.push(context)
    await sessionCookieSet(context, owner.token)
    const page = await context.newPage()

    // Seed the device-local cache purely through public application behavior:
    // signing in and opening the settled session writes the record and the
    // last-active-account preference.
    await page.goto(`/sessions/${cachedSessionId}`)
    await cachedSessionExpectRendered(page)
    await expect(readOnlyNotice(page)).toHaveCount(0)
    // Baseline for the read-only assertions below: these controls exist while
    // the session is authoritative and writable.
    await expect(page.getByRole("button", { name: `Rename ${cachedSessionTitle}` })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled()

    await expect
      .poll(async () => (await settledRecordsRead(page, settledDatabaseName)).length, { timeout: 15_000 })
      .toBeGreaterThan(0)

    const cachedRecords = await settledRecordsRead(page, settledDatabaseName)
    const ownerRecord = cachedRecords.find((record) => record.sessionId === cachedSessionId)
    expect(ownerRecord).toBeDefined()
    expect(ownerRecord?.userId).toBe(owner.userId)
    expect(ownerRecord?.etag).toEqual(expect.any(String))
    expect(ownerRecord?.schemaVersion).toEqual(expect.any(String))
    expect(ownerRecord?.asOfSequence).toEqual(expect.any(Number))

    const lastActiveAccount = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      lastActiveAccountStorageKey,
    )
    expect(lastActiveAccount).toBe(owner.userId)

    // Offline while still signed in: the settled session is still served
    // completely from the device-local record. The sidebar buttons drive
    // client-side navigation, so no document request is involved and the
    // assertion covers the cache rather than the network.
    const conversations = page.getByRole("list", { name: "Active conversations" })
    await conversations
      .getByRole("button", { name: new RegExp(otherSessionTitle) })
      .first()
      .click()
    await expect(sessionBody(page).getByText(otherSessionTitle).first()).toBeVisible()

    await context.setOffline(true)
    await conversations
      .getByRole("button", { name: new RegExp(cachedSessionTitle) })
      .first()
      .click()
    await cachedSessionExpectRendered(page)

    // Offline is read-only: the notice renders and every mutation surface is
    // withdrawn even though the session cookie is still present.
    await expect(readOnlyNotice(page)).toHaveText(offlineNotice)
    const offlineComposer = page.getByRole("textbox", { name: "Message" })
    await expect(offlineComposer).toBeDisabled()
    await expect(offlineComposer).toHaveAttribute("placeholder", "Read-only. Sending is unavailable.")
    await expect(page.getByRole("button", { name: "Pin session" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Unpin session" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: `Rename ${cachedSessionTitle}` })).toHaveCount(0)
    await expect(page.locator("header").getByRole("button", { name: /^Events offline/ })).toBeVisible()

    // Going offline must never discard the cached account data.
    const recordsWhileOffline = await settledRecordsRead(page, settledDatabaseName)
    expect(recordsWhileOffline.some((record) => record.sessionId === cachedSessionId)).toBe(true)

    // Restoring connectivity reopens the feed and revalidates the authoritative
    // selected session and its related resources in place. The replacement
    // feed remains reconnecting until its first heartbeat reaches the browser.
    let recoveryLoadCount = 0
    page.on("load", () => {
      recoveryLoadCount += 1
    })
    const sessionUrlBeforeRecovery = page.url()
    const recoveryResponseWait = (pathname: string) =>
      page.waitForResponse(
        (response) => {
          const url = new URL(response.url())
          return response.request().method() === "GET" && url.origin === baseOrigin && url.pathname === pathname
        },
        { timeout: 30_000 },
      )
    const authoritativeSession = recoveryResponseWait(`/api/sessions/${cachedSessionId}`)
    const authoritativeMessages = recoveryResponseWait(`/api/sessions/${cachedSessionId}/messages`)
    const authoritativeDelegations = recoveryResponseWait(`/api/sessions/${cachedSessionId}/delegations`)
    await context.setOffline(false)
    await expect(page.locator("header").getByRole("button", { name: "Events reconnecting" })).toBeVisible()
    const recoveryResponses = await Promise.all([authoritativeSession, authoritativeMessages, authoritativeDelegations])
    for (const response of recoveryResponses) expect([200, 304]).toContain(response.status())
    await expect(page.locator("header").getByRole("button", { name: "Events connected" })).toBeVisible({
      timeout: 30_000,
    })
    expect(page.url()).toBe(sessionUrlBeforeRecovery)
    expect(recoveryLoadCount).toBe(0)
    await cachedSessionExpectRendered(page)
    await expect(readOnlyNotice(page)).toHaveCount(0)
    await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled()
    await expect(page.getByRole("button", { name: `Rename ${cachedSessionTitle}` })).toBeVisible()

    // Signed out: the last locally active account may be browsed read-only.
    await context.clearCookies()
    await page.goto(`/sessions/${cachedSessionId}`)
    await cachedSessionExpectRendered(page)
    await expect(readOnlyNotice(page)).toHaveText(signedOutNotice)

    // Every mutation surface is withdrawn while read-only.
    const composer = page.getByRole("textbox", { name: "Message" })
    await expect(composer).toBeDisabled()
    await expect(composer).toHaveAttribute("placeholder", "Read-only. Sending is unavailable.")
    await expect(page.getByRole("button", { name: "Pin session" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Unpin session" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: `Rename ${cachedSessionTitle}` })).toHaveCount(0)

    // Sign-out must not delete the cached account data.
    const recordsAfterSignOut = await settledRecordsRead(page, settledDatabaseName)
    expect(recordsAfterSignOut.some((record) => record.sessionId === cachedSessionId)).toBe(true)

    // A different account on the same device never sees the cached records.
    await sessionCookieSet(context, otherAccount.token)
    await page.goto(`/sessions/${cachedSessionId}`)
    await expect(sessionBody(page).getByText(cachedUserMessage)).toHaveCount(0)
    await expect(sessionBody(page).getByText(cachedAssistantMessage)).toHaveCount(0)

    const isolatedRecords = await settledRecordsRead(page, settledDatabaseName)
    expect(isolatedRecords.every((record) => record.userId !== otherAccount.userId)).toBe(true)

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
