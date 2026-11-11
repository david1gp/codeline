import { type BrowserContext, expect } from "@playwright/test"
import { e2eOriginGet } from "../e2eOriginGet.js"

export async function contextCompactionMessagesRead(
  context: BrowserContext,
  sessionId: string,
): Promise<Array<{ content: string; role: string }>> {
  const origin = e2eOriginGet()
  const response = await context.request.get(`${origin}/api/sessions/${sessionId}/messages`)
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { messages: Array<{ content: string; role: string }> }).messages
}
