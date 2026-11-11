import { type BrowserContext, expect } from "@playwright/test"
import { e2eOriginGet } from "../e2eOriginGet.js"

export async function contextCompactionRunSnapshotRead(
  context: BrowserContext,
  sessionId: string,
  runId: string,
): Promise<{ status: string }> {
  const origin = e2eOriginGet()
  const response = await context.request.get(`${origin}/api/sessions/${sessionId}/runs/${runId}/snapshot`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as { status: string }
}
