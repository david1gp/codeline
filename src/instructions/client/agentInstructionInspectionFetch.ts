import { createResultError, type Result } from "@adaptive-ds/result"
import { apiHttpClientCreate } from "../../api/client/apiHttpClientCreate.js"
import {
  type AgentInstructionInspectionResponse,
  agentInstructionInspectionResponseSchema,
} from "../api/agentInstructionInspectionResponseSchema.js"

type AgentInstructionInspectionFetchDependencies = {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

/** Typed read of the discovered global and project `AGENTS.md` sources for a project. */
export function agentInstructionInspectionFetch(
  projectId: string,
  dependencies: AgentInstructionInspectionFetchDependencies = {},
): Promise<Result<AgentInstructionInspectionResponse>> {
  const op = "agentInstructionInspectionFetch"
  if (projectId.trim().length === 0) {
    return Promise.resolve(createResultError(op, "The project identifier is required."))
  }

  const client = apiHttpClientCreate({ fetch: dependencies.fetch ?? fetch })
  return client.get({
    cache: "no-store",
    op,
    path: "/api/agent-instructions",
    query: { project: projectId },
    responseSchema: agentInstructionInspectionResponseSchema,
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  })
}
