import { type BrowserContext, expect } from "@playwright/test"
import { chatCommandExpansionMessagesRead } from "./chatCommandExpansionMessagesRead.js"

export async function chatCommandExpansionPreSessionAssert(context: BrowserContext, sessionId: string): Promise<void> {
  const messages = await chatCommandExpansionMessagesRead(context, sessionId)
  // Exactly one turn: the expansion is not sent again after creation.
  expect(messages).toHaveLength(1)
  expect(messages[0]?.metadata.command).toMatchObject({
    argumentsText: "src/index.ts naming",
    name: "review",
    templateDigest: "sha256-6db419f142eb972fa54772f28a3bde6bd30b0c6d2b05204e1280cd3c06992662",
    version: 1,
  })
}
