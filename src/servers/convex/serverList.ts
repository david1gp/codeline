import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericQueryCtx } from "convex/server"
import { serverDocumentPublic } from "./serverDocumentPublic.js"
import type { ServerRecord } from "./serverRecord.js"

type ServerQueryContext = Pick<GenericQueryCtx<any>, "db">

function searchableValue(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value) ?? ""
  } catch (_error) {
    return ""
  }
}

export async function serverList(
  context: ServerQueryContext,
  organizationId: string,
  search?: string,
): Promise<Result<ServerRecord[]>> {
  const op = "serverList"

  try {
    const documents = await context.db
      .query("servers")
      .withIndex("organizationId", (query: any) => query.eq("organizationId", organizationId))
      .collect()
    const normalizedSearch = search?.toLocaleLowerCase()
    const servers = documents
      .filter((document: any) => {
        if (normalizedSearch === undefined) return true
        return [document.name, searchableValue(document.metadata)].some((value) =>
          value.toLocaleLowerCase().includes(normalizedSearch),
        )
      })
      .map((document: any) => serverDocumentPublic(document))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))

    return createResult(servers)
  } catch (_error) {
    return createResultError(op, "The servers could not be loaded.")
  }
}
