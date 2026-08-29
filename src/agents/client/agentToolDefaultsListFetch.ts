import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { AgentToolDefaults } from "../schema/agentToolDefaultsSchema.js"
import { agentDetailFetch } from "./agentDetailFetch.js"
import { agentListFetch } from "./agentListFetch.js"

type AgentToolDefaultsListFetchDependencies = {
  agentDetailFetch?: typeof agentDetailFetch
  agentListFetch?: typeof agentListFetch
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  signal?: AbortSignal
}

export type AgentToolDefaultsEntry = {
  agentPrompt?: string
  agentId: string
  name: string
  /** Null for a primary agent; set for an agent that is only selectable as a subagent. */
  parentAgentId: string | null
  role: string
  tools: AgentToolDefaults
}

const agentToolDefaultsFallback = {
  bash: false,
  webfetch: false,
}

/**
 * Per-agent tool defaults for one server. The list route does not carry
 * tool defaults, so each agent's detail representation is read and the unreadable ones
 * fall back to the disabled defaults the server itself applies.
 */
export async function agentToolDefaultsListFetch(
  serverId: string,
  dependencies: AgentToolDefaultsListFetchDependencies = {},
): Promise<Result<readonly AgentToolDefaultsEntry[]>> {
  const op = "agentToolDefaultsListFetch"
  if (serverId.trim().length === 0) return createResultError(op, "The server identifier is required.")

  const listFetch = dependencies.agentListFetch ?? agentListFetch
  const detailFetch = dependencies.agentDetailFetch ?? agentDetailFetch
  const request = {
    ...(dependencies.fetch === undefined ? {} : { fetch: dependencies.fetch }),
    ...(dependencies.signal === undefined ? {} : { signal: dependencies.signal }),
  }

  const list = await listFetch(serverId, request)
  if (!list.success) return list

  const details = await Promise.all(list.data.agents.map((agent) => detailFetch(serverId, agent.id, request)))
  const entries = list.data.agents.map((agent, index) => {
    const detail = details[index]
    const tools = detail?.success === true ? detail.data?.agent.configuration.tools : undefined
    return {
      ...(detail?.success === true && detail.data?.agent.agentPrompt === undefined
        ? {}
        : { agentPrompt: detail?.success === true ? detail.data?.agent.agentPrompt : undefined }),
      agentId: agent.id,
      name: agent.name,
      parentAgentId: agent.parentAgentId,
      role: agent.role,
      tools: {
        bash: tools?.bash ?? agentToolDefaultsFallback.bash,
        webfetch: tools?.webfetch ?? agentToolDefaultsFallback.webfetch,
        ...(tools?.read === undefined ? {} : { read: tools.read }),
        ...(tools?.write === undefined ? {} : { write: tools.write }),
        ...(tools?.edit === undefined ? {} : { edit: tools.edit }),
      },
    } satisfies AgentToolDefaultsEntry
  })
  return createResult(entries)
}
