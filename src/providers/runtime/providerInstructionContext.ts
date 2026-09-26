import type { AgentInstructionsResolvedSnapshot } from "../../instructions/schema/agentInstructionsResolvedSnapshotSchema.js"

export type ProviderInstructionContext = Readonly<{
  projectRoot: string
  snapshot: AgentInstructionsResolvedSnapshot
}>
