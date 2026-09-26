import { createHash } from "node:crypto"

export function runToolDetailIdCreate(runId: string, toolCallId: string): string {
  const direct = toolCallId.trim()
  if (direct.length > 0 && direct.length <= 200 && !/[\r\n]/.test(direct)) return direct
  return `tool-${createHash("sha256").update(`${runId}\u0000${toolCallId}`).digest("hex").slice(0, 48)}`
}
