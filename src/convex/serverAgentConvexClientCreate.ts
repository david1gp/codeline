import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type { AgentListRow } from "../agents/convex/agentList.js"
import type { AgentLoadResult } from "../agents/convex/agentLoad.js"
import type { AgentRecord } from "../agents/convex/agentRecord.js"
import type { ServerRecord } from "../servers/convex/serverRecord.js"
import type { ServerAgentConvexClient } from "./serverAgentConvexClient.js"

type ConvexResult<T> = Result<T>

const serverListReference = makeFunctionReference<
  "query",
  { organizationId: string; search?: string },
  ConvexResult<ServerRecord[]>
>("servers:serverListInternal")
const serverLoadReference = makeFunctionReference<
  "query",
  { organizationId: string; serverId: string },
  ConvexResult<ServerRecord>
>("servers:serverLoadInternal")
const agentListReference = makeFunctionReference<
  "query",
  { organizationId: string; search?: string; serverId: string },
  ConvexResult<AgentListRow[]>
>("agents:agentListInternal")
const agentLoadReference = makeFunctionReference<
  "query",
  { agentId: string; organizationId: string; serverId: string },
  ConvexResult<AgentLoadResult>
>("agents:agentLoadInternal")
const agentCreateReference = makeFunctionReference<
  "mutation",
  { configuration: unknown; name: string; organizationId: string; role: string; serverId: string },
  ConvexResult<AgentRecord>
>("agents:agentCreateInternal")
const agentUpdateReference = makeFunctionReference<
  "mutation",
  {
    agentId: string
    configuration?: unknown
    name?: string
    organizationId: string
    role?: string
    serverId: string
  },
  ConvexResult<AgentRecord>
>("agents:agentUpdateInternal")

export function serverAgentConvexClientCreate(url: string, adminKey: string): Result<ServerAgentConvexClient> {
  const op = "serverAgentConvexClientCreate"

  try {
    const client = new ConvexHttpClient(url, { logger: false, skipConvexDeploymentUrlCheck: true })
    const adminClient = client as ConvexHttpClient & { setAdminAuth: (key: string) => void }
    adminClient.setAdminAuth(adminKey)
    return createResult({
      agentCreate: (organizationId, serverId, input) =>
        serverAgentConvexMutation(client, "agentCreate", agentCreateReference, {
          ...input,
          organizationId,
          serverId,
        }),
      agentList: (organizationId, serverId, search) =>
        serverAgentConvexQuery(client, "agentList", agentListReference, {
          organizationId,
          ...(search === undefined ? {} : { search }),
          serverId,
        }),
      agentLoad: (organizationId, serverId, agentId) =>
        serverAgentConvexQuery(client, "agentLoad", agentLoadReference, { agentId, organizationId, serverId }),
      agentUpdate: (organizationId, serverId, agentId, input) =>
        serverAgentConvexMutation(client, "agentUpdate", agentUpdateReference, {
          ...input,
          agentId,
          organizationId,
          serverId,
        }),
      serverList: (organizationId, search) =>
        serverAgentConvexQuery(client, "serverList", serverListReference, {
          organizationId,
          ...(search === undefined ? {} : { search }),
        }),
      serverLoad: (organizationId, serverId) =>
        serverAgentConvexQuery(client, "serverLoad", serverLoadReference, { organizationId, serverId }),
    })
  } catch (_error) {
    return createResultError(op, "The Convex server client could not be created.")
  }
}

async function serverAgentConvexQuery<T>(
  client: ConvexHttpClient,
  operation: string,
  reference: any,
  args: Record<string, unknown>,
): Promise<Result<T>> {
  return serverAgentConvexCall(operation, () => client.query(reference, args))
}

async function serverAgentConvexMutation<T>(
  client: ConvexHttpClient,
  operation: string,
  reference: any,
  args: Record<string, unknown>,
): Promise<Result<T>> {
  return serverAgentConvexCall(operation, () => client.mutation(reference, args))
}

async function serverAgentConvexCall<T>(operation: string, call: () => Promise<unknown>): Promise<Result<T>> {
  try {
    const value = await call()
    if (!serverAgentConvexResultIs(value))
      return createResultError(`serverAgentConvex${operation}Call`, "The Convex response is invalid.")
    return value as Result<T>
  } catch (_error) {
    return createResultError(`serverAgentConvex${operation}Call`, "The Convex server is unavailable.")
  }
}

function serverAgentConvexResultIs(value: unknown): value is ConvexResult<unknown> {
  return typeof value === "object" && value !== null && "success" in value && typeof value.success === "boolean"
}
