import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import { agentDetailSchemaVersion } from "./agentDetailSchemaVersion.js"
import { agentDetailResponseV2Schema, type AgentDetailResponseV2 } from "./agentDetailResponseV2Schema.js"
import { agentRepresentationRevisionCreate } from "./agentRepresentationRevisionCreate.js"

type AgentDetailResponseCreateInput = {
  agent: AgentDetailResponseV2["agent"]
  organizationId: string
}

export function agentDetailResponseCreate(input: AgentDetailResponseCreateInput): Result<AgentDetailResponseV2> {
  const op = "agentDetailResponseCreate"
  const agent = { ...input.agent }
  const revision = agentRepresentationRevisionCreate(JSON.stringify(agent))
  const etag = apiRepresentationEtagCreate(
    `agent\u0000${input.organizationId}\u0000${agent.serverId}\u0000${agent.id}`,
    agentDetailSchemaVersion,
    revision,
  )
  const parsed = v.safeParse(agentDetailResponseV2Schema, {
    agent,
    etag,
    revision,
    schemaVersion: agentDetailSchemaVersion,
  })
  if (!parsed.success) return createResultError(op, "The agent detail representation is invalid.")
  return createResult(parsed.output)
}
