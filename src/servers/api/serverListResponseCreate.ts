import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiRepresentationEtagCreate } from "../../api/representation/apiRepresentationEtagCreate.js"
import { type ServerListResponseV2, serverListResponseV2Schema } from "./serverListResponseV2Schema.js"
import { serverListSchemaVersion } from "./serverListSchemaVersion.js"

type ServerListResponseCreateInput = {
  organizationId: string
  search?: string
  servers: ReadonlyArray<{ id: string; name: string }>
}

function serverListRepresentationRevision(servers: ReadonlyArray<{ id: string; name: string }>): number {
  const representation = servers.map((server) => `${server.id}\u0000${server.name}`).join("\u0001")
  let hash = 2_166_136_261
  for (const character of representation) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619)
  return hash >>> 0
}

export function serverListResponseCreate(input: ServerListResponseCreateInput): Result<ServerListResponseV2> {
  const op = "serverListResponseCreate"
  const servers = input.servers.map((server) => ({ id: server.id, name: server.name }))
  const revision = serverListRepresentationRevision(servers)
  const etag = apiRepresentationEtagCreate(
    `servers\u0000${input.organizationId}\u0000${input.search ?? ""}`,
    serverListSchemaVersion,
    revision,
  )
  const parsed = v.safeParse(serverListResponseV2Schema, {
    etag,
    revision,
    schemaVersion: serverListSchemaVersion,
    servers,
  })
  if (!parsed.success) return createResultError(op, "The server list representation is invalid.")
  return createResult(parsed.output)
}
