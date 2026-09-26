import { demoSessionMessagesFixture } from "./demoSessionMessagesFixture.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

const emptyMessage = { content: "", role: "assistant" } as const

/** Picks a deterministic finalized message pair for the specimen variant. */
export function demoFinalizedMessageFixture(
  variant: DemoSessionScreenVariant,
): ReadonlyArray<{ content: string; role: "assistant" | "user" }> {
  if (variant === "empty") return [emptyMessage]
  if (variant === "editing") return [demoSessionMessagesFixture[0]]
  return [demoSessionMessagesFixture[0], demoSessionMessagesFixture[1]]
}
