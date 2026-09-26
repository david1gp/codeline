import { createHash } from "node:crypto"

export function runHistoryToolEntryIdCreate(runId: string, toolCallId: string): string {
  return `tool-${createHash("sha256").update(`${runId}\u0000${toolCallId}`, "utf8").digest("hex").slice(0, 48)}`
}
