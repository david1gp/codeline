import { type BrowserContext, expect } from "@playwright/test"

type CommandMessageMetadata = {
  command: {
    argumentsText: string
    catalogDigest: string
    expandedUserText: string
    name: string
    overrides: { agent?: string; model?: string; subtask?: boolean }
    templateDigest: string
    version: number
  }
}

export async function chatCommandExpansionMessagesRead(
  context: BrowserContext,
  sessionId: string,
): Promise<Array<{ content: string; metadata: CommandMessageMetadata }>> {
  const baseOrigin = process.env.PUBLIC_ORIGIN ?? "https://preview.codeline.work"
  const response = await context.request.get(`${baseOrigin}/api/sessions/${sessionId}/messages`)
  expect(response.ok(), await response.text()).toBe(true)
  const body = (await response.json()) as { messages: Array<{ content: string; metadata: unknown; role: string }> }
  return body.messages
    .filter((message) => message.role === "user")
    .map((message) => ({ content: message.content, metadata: message.metadata as CommandMessageMetadata }))
}
