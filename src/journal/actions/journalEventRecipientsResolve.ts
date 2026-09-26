import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseTransaction } from "../../database/databaseClient.js"
import { journalAuthorizedUserIdsSchema } from "../schema/journalAuthorizedUserIdsSchema.js"
import { type JournalEventResource, journalEventResourceSchema } from "../schema/journalEventResourceSchema.js"
import type { JournalEventRecipientResolver } from "./journalEventRecipientResolver.js"

function journalUserIdsSort(userIds: readonly string[]): string[] {
  return [...new Set(userIds)].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
}

export async function journalEventRecipientsResolve(
  transaction: DatabaseTransaction,
  resource: JournalEventResource,
  resolver: JournalEventRecipientResolver,
): Promise<Result<string[]>> {
  const op = "journalEventRecipientsResolve"
  const parsedResource = v.safeParse(journalEventResourceSchema, resource)
  if (!parsedResource.success) return createResultError(op, "The journal event resource is invalid.")

  let resolved: Result<readonly string[]>
  try {
    resolved = await resolver(transaction, parsedResource.output)
  } catch (_error) {
    return createResultError(op, "The journal event recipients could not be resolved.")
  }
  if (!resolved.success) return createResultError(op, resolved.errorMessage)

  const parsedUserIds = v.safeParse(journalAuthorizedUserIdsSchema, resolved.data)
  if (!parsedUserIds.success) return createResultError(op, "The resolved journal recipients are invalid.")

  const userIds = journalUserIdsSort(parsedUserIds.output)
  if (userIds.length === 0) return createResultError(op, "The journal event has no authorized recipients.")
  return createResult(userIds)
}
