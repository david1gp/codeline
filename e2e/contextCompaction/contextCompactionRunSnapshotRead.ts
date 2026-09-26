import { type BrowserContext, expect } from "@playwright/test"

export async function contextCompactionRunSnapshotRead(
  context: BrowserContext,
  sessionId: string,
  runId: string,
): Promise<{ status: string }> {
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const response = await context.request.get(`${origin}/api/sessions/${sessionId}/runs/${runId}/snapshot`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as { status: string }
}
