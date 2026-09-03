import { type BrowserContext, expect, type Page, test } from "@playwright/test"
import { sessionCacheDatabaseConfig } from "../src/session/storage/sessionCacheDatabaseConfig.js"
import { e2eExampleDataSeedForMember, e2eExampleDataSeedRestore } from "./e2eExampleDataSeedForMember.js"
import { e2eMemberSessionsIssue } from "./e2eMemberSessionsIssue.js"
import { e2eMemberSessionsPurge } from "./e2eMemberSessionsPurge.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

const sessionCookieName = "__Host-codeline-session"
const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
const lastActiveAccountStorageKey = "codeline-last-active-account"
const serviceWorkerScriptUrl = new URL("/service-worker.js", baseOrigin).href
const serviceWorkerControllerChangeStorageKey = "codeline-e2e-service-worker-controller-change"

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

/** Reads the bounded device-local snapshot records the application itself wrote. */
async function sessionSnapshotRecordsRead(page: Page, databaseName: string): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async (name) => {
    const opened = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      if (!opened.objectStoreNames.contains("sessionSnapshots")) return []
      const store = opened.transaction("sessionSnapshots", "readonly").objectStore("sessionSnapshots")
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

function semanticHistory(page: Page) {
  return sessionBody(page)
    .getByRole("region", { name: "Recent activity", exact: true })
    .getByRole("list", { name: "Recent semantic activity", exact: true })
}

function readOnlyNotice(page: Page) {
  return page.locator("[data-session-read-only='true']")
}

async function serviceWorkerCurrentShellEnsure(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update()
  })

  const waiting = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return registration.waiting !== null
  })

  if (waiting) {
    // Exercise the same visible update action as production. It posts the
    // repository's skip-waiting message and reloads from controllerchange.
    await page.evaluate((storageKey) => {
      sessionStorage.removeItem(storageKey)
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        () => sessionStorage.setItem(storageKey, "changed"),
        { once: true },
      )
    }, serviceWorkerControllerChangeStorageKey)

    const updateReload = page.getByRole("button", { name: "Reload to update", exact: true })
    await expect(updateReload).toBeVisible()
    const navigation = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame())
    await updateReload.click()
    await navigation
    await page.waitForLoadState("load")
    await expect
      .poll(() =>
        page.evaluate((storageKey) => sessionStorage.getItem(storageKey), serviceWorkerControllerChangeStorageKey),
      )
      .toBe("changed")
  }

  await expect
    .poll(
      async () =>
        page.evaluate(async (scriptUrl) => {
          const registration = await navigator.serviceWorker.ready
          return (
            registration.active?.state === "activated" &&
            registration.waiting === null &&
            navigator.serviceWorker.controller?.scriptURL === scriptUrl
          )
        }, serviceWorkerScriptUrl),
      { timeout: 30_000 },
    )
    .toBe(true)

  const currentAssetUrl = await page.evaluate(() => {
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]')
    return script === null ? undefined : new URL(script.src, window.location.href).href
  })
  if (currentAssetUrl === undefined) throw new Error("The current application asset was not loaded.")
  expect(new URL(currentAssetUrl).pathname.startsWith("/assets/")).toBe(true)

  const currentAssetResponse = await page.context().request.get(currentAssetUrl, {
    headers: { "Cache-Control": "no-cache" },
  })
  expect(currentAssetResponse.ok(), await currentAssetResponse.text()).toBe(true)
}

async function cachedSessionExpectRendered(page: Page): Promise<void> {
  await expect(page.getByText(cachedSessionTitle, { exact: true }).first()).toBeVisible()
  await expect(semanticHistory(page).getByText(cachedUserMessage, { exact: true })).toBeVisible()
  await expect(semanticHistory(page).getByText(cachedAssistantMessage, { exact: true })).toBeVisible()
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
    // Establish the current shell before any offline cache records are written;
    // otherwise a waiting worker could leave the reload on an older shell.
    await page.goto("/")
    await serviceWorkerCurrentShellEnsure(page)
    await page.goto(`/sessions/${cachedSessionId}`)
    await cachedSessionExpectRendered(page)
    await expect(readOnlyNotice(page)).toHaveCount(0)
    // Baseline for the read-only assertions below: these controls exist while
    // the session is authoritative and writable.
    await expect(page.getByRole("button", { name: `Rename ${cachedSessionTitle}` })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Message" })).toBeEnabled()

    await expect
      .poll(async () => (await sessionSnapshotRecordsRead(page, sessionCacheDatabaseConfig.name)).length, {
        timeout: 15_000,
      })
      .toBeGreaterThan(0)

    const cachedRecords = await sessionSnapshotRecordsRead(page, sessionCacheDatabaseConfig.name)
    const ownerRecord = cachedRecords.find((record) => record.sessionId === cachedSessionId)
    expect(ownerRecord).toBeDefined()
    expect(ownerRecord?.userId).toBe(owner.userId)
    expect(ownerRecord?.schemaVersion).toBe(sessionCacheDatabaseConfig.recordSchemaVersion)
    expect(ownerRecord?.storedAt).toEqual(expect.any(Number))
    expect(ownerRecord?.payload).toEqual(expect.objectContaining({ throughPosition: expect.any(Number) }))

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
    await expect(sessionBody(page).getByText(otherSessionTitle, { exact: true }).first()).toBeVisible()

    await context.setOffline(true)
    await conversations
      .getByRole("button", { name: new RegExp(cachedSessionTitle) })
      .first()
      .click()
    await cachedSessionExpectRendered(page)
    await page.reload()
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
    const recordsWhileOffline = await sessionSnapshotRecordsRead(page, sessionCacheDatabaseConfig.name)
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
    const authoritativeMessages = recoveryResponseWait(`/api/sessions/${cachedSessionId}/bounded-snapshot`)
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
    const recordsAfterSignOut = await sessionSnapshotRecordsRead(page, sessionCacheDatabaseConfig.name)
    expect(recordsAfterSignOut.some((record) => record.sessionId === cachedSessionId)).toBe(true)

    // A different account on the same device never sees the cached records.
    await sessionCookieSet(context, otherAccount.token)
    await page.goto(`/sessions/${cachedSessionId}`)
    await expect(semanticHistory(page).getByText(cachedUserMessage, { exact: true })).toHaveCount(0)
    await expect(semanticHistory(page).getByText(cachedAssistantMessage, { exact: true })).toHaveCount(0)

    const isolatedRecords = await sessionSnapshotRecordsRead(page, sessionCacheDatabaseConfig.name)
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
