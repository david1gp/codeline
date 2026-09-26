import { type APIRequestContext, expect } from "@playwright/test"

export async function expiredCursorSessionRename(
  api: APIRequestContext,
  sessionId: string,
  title: string,
): Promise<void> {
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const shell = await api.get(`${origin}/api/sessions/${sessionId}`)
  expect(shell.status()).toBe(200)
  const etag = shell.headers().etag ?? ""
  expect(etag.length).toBeGreaterThan(0)
  const renamed = await api.patch(`${origin}/api/sessions/${sessionId}`, {
    data: { title },
    headers: { "Content-Type": "application/json", "If-Match": etag, Origin: origin },
  })
  expect(renamed.status(), await renamed.text()).toBe(200)
}
