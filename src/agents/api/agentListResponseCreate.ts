import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import { type AgentListResponse, agentListResponseSchema } from "./agentListResponseSchema.js"
import { agentListSchemaVersion } from "./agentListSchemaVersion.js"
import { agentRepresentationRevisionCreate } from "./agentRepresentationRevisionCreate.js"

type AgentListResponseCreateInput = {
  agents: AgentListResponse["agents"]
  organizationId: string
  search?: string
  serverId: string
}

export function agentListResponseCreate(input: AgentListResponseCreateInput): Result<AgentListResponse> {
  const op = "agentListResponseCreate"
  const agents = input.agents.map((agent) => ({ ...agent }))
  const revision = agentRepresentationRevisionCreate(JSON.stringify(agents))
  const etag = apiRepresentationEtagCreate(
    `agents\u0000${input.organizationId}\u0000${input.serverId}\u0000${input.search ?? ""}`,
    agentListSchemaVersion,
    revision,
  )
  const parsed = v.safeParse(agentListResponseSchema, {
    agents,
    etag,
    revision,
    schemaVersion: agentListSchemaVersion,
  })
  if (!parsed.success) return createResultError(op, "The agent list representation is invalid.")
  return createResult(parsed.output)
}
