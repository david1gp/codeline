import { expect, type BrowserContext, type Page } from "@playwright/test"
import { e2eMemberSessionsExpire } from "../e2eMemberSessionsExpire.js"
import { e2eOriginGet } from "../e2eOriginGet.js"
import { managedOriginEventFeedStatusRead } from "./managedOriginEventFeedStatusRead.js"

export async function managedOriginAuthExpiryAction(
  runId: string,
  userId: string,
  context: BrowserContext,
  page: Page,
  settledSessionId: string | undefined,
) {
  // Age the identity out through the repository-owned expiry action.
  const expiredSessions = await e2eMemberSessionsExpire(runId, userId)
  expect(expiredSessions.length).toBeGreaterThan(0)
  for (const expiredSession of expiredSessions) {
    expect(Date.parse(expiredSession.expiresAt)).toBeLessThan(Date.now())
  }

  // A reconnect with the expired cookie is rejected, and so is every other authenticated read.
  expect(await managedOriginEventFeedStatusRead(page)).toBe(401)
  const baseOrigin = e2eOriginGet()
  const snapshot = await context.request.get(`${baseOrigin}/api/sessions/${settledSessionId}/bounded-snapshot`)
  expect(snapshot.status()).toBe(401)

  // Sever and recycle the live feed through the application's own offline and
  // online transitions. The reopened connection must trigger sign-out.
  await context.setOffline(true)
  await context.setOffline(false)
}
