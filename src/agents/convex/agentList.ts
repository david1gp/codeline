import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { serverLoad } from "../../servers/convex/serverLoad.js"
import type { ServerRecord } from "../../servers/convex/serverRecord.js"
import { agentDocumentPublic } from "./agentDocumentPublic.js"
import type { AgentRecord } from "./agentRecord.js"

export type AgentListRow = {
  agent: AgentRecord
  server: ServerRecord
}

type AgentQueryContext = Pick<GenericQueryCtx<any>, "db">

function searchableValue(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value) ?? ""
  } catch (_error) {
    return ""
  }
}

export async function agentList(
  context: AgentQueryContext,
  organizationId: string,
  serverId: string,
  search?: string,
): Promise<Result<AgentListRow[]>> {
  const op = "agentList"
  const server = await serverLoad(context, organizationId, serverId)
  if (!server.success) return createResultError(op, server.errorMessage)

  try {
    const documents = await context.db
      .query("agents")
      .withIndex("serverIdSortOrderNameId", (query: any) => query.eq("serverId", serverId))
      .collect()
    const normalizedSearch = search?.toLocaleLowerCase()
    const rows = documents
      .filter((document: any) => {
        if (normalizedSearch === undefined) return true
        return [document.name, document.role, searchableValue(document.configuration)].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch),
        )
      })
      .map((document: any) => ({ agent: agentDocumentPublic(document), server: server.data }))
      .sort(
        (left, right) =>
          left.agent.sortOrder - right.agent.sortOrder ||
          left.agent.name.localeCompare(right.agent.name) ||
          left.agent.id.localeCompare(right.agent.id),
      )
    return createResult(rows)
  } catch (_error) {
    return createResultError(op, "The agents could not be loaded.")
  }
}
