import type { AgentInstructionSnapshotEntry } from "../schema/agentInstructionSnapshotEntrySchema.js"

export function agentInstructionsContentRender(entries: readonly AgentInstructionSnapshotEntry[]): string {
  return entries.map(({ content }) => content).join("\n\n")
}
