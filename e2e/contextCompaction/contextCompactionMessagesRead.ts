import { type BrowserContext, expect } from "@playwright/test"

export async function contextCompactionMessagesRead(
  context: BrowserContext,
  sessionId: string,
): Promise<Array<{ content: string; role: string }>> {
  const origin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const response = await context.request.get(`${origin}/api/sessions/${sessionId}/messages`)
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { messages: Array<{ content: string; role: string }> }).messages
}
