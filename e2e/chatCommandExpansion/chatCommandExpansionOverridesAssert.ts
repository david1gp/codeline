import { type BrowserContext, expect } from "@playwright/test"
import { chatCommandExpansionMessagesRead } from "./chatCommandExpansionMessagesRead.js"

export async function chatCommandExpansionOverridesAssert(context: BrowserContext, sessionId: string): Promise<void> {
  const messages = await chatCommandExpansionMessagesRead(context, sessionId)
  const byName = new Map(messages.map((message) => [message.metadata.command.name, message]))
  expect([...byName.keys()].sort()).toEqual(["git/status", "simulate", "subtask"])
  // The interpolated output is persisted, never the executable template.
  expect(byName.get("git/status")?.metadata.command.expandedUserText).toBe(
    "The interpolated marker is codeline-command-marker for now.",
  )
  expect(byName.get("git/status")?.metadata.command.templateDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
  expect(byName.get("subtask")?.metadata.command.overrides).toMatchObject({ subtask: true })
  expect(byName.get("simulate")?.metadata.command.overrides).toMatchObject({
    model: "deterministic/simulation-streaming",
  })
}
