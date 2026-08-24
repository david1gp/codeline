import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import { agentDetailSchemaVersion } from "./agentDetailSchemaVersion.js"
import { agentDetailResponseSchema, type AgentDetailResponse } from "./agentDetailResponseSchema.js"
import { agentRepresentationRevisionCreate } from "./agentRepresentationRevisionCreate.js"

type AgentDetailResponseCreateInput = {
  agent: AgentDetailResponse["agent"]
  organizationId: string
}

export function agentDetailResponseCreate(input: AgentDetailResponseCreateInput): Result<AgentDetailResponse> {
  const op = "agentDetailResponseCreate"
  const agent = { ...input.agent }
  const revision = agentRepresentationRevisionCreate(JSON.stringify(agent))
  const etag = apiRepresentationEtagCreate(
    `agent\u0000${input.organizationId}\u0000${agent.serverId}\u0000${agent.id}`,
    agentDetailSchemaVersion,
    revision,
  )
  const parsed = v.safeParse(agentDetailResponseSchema, {
    agent,
    etag,
    revision,
    schemaVersion: agentDetailSchemaVersion,
  })
  if (!parsed.success) return createResultError(op, "The agent detail representation is invalid.")
  return createResult(parsed.output)
}
