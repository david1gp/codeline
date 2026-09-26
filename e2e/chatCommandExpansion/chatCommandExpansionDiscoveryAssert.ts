import { type BrowserContext, expect } from "@playwright/test"
import { chatCommandExpansionMessagesRead } from "./chatCommandExpansionMessagesRead.js"

export async function chatCommandExpansionDiscoveryAssert(context: BrowserContext, sessionId: string): Promise<void> {
  const messages = await chatCommandExpansionMessagesRead(context, sessionId)
  expect(messages).toHaveLength(1)
  const [persisted] = messages
  expect(persisted?.content).toBe("Review src/index.ts with a focus on naming.")
  expect(persisted?.metadata.command).toMatchObject({
    argumentsText: "src/index.ts naming",
    expandedUserText: "Review src/index.ts with a focus on naming.",
    name: "review",
    overrides: {},
    templateDigest: "sha256-6db419f142eb972fa54772f28a3bde6bd30b0c6d2b05204e1280cd3c06992662",
    version: 1,
  })
  expect(persisted?.metadata.command.catalogDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
}
