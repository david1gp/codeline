import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { organizationMemberTable } from "../../identity/db/organizationMemberTable.js"
import type { JournalEventRecipientResolver } from "../../journal/actions/journalEventRecipientResolver.js"
import { noteTable } from "./noteTable.js"

export function noteJournalRecipientResolverCreate(options: {
  organizationId: string
  pendingUserId?: string
}): JournalEventRecipientResolver {
  return async (transaction, resource): Promise<Result<readonly string[]>> => {
    const op = "noteJournalRecipientResolver"
    if (resource.resourceType !== "note") return createResultError(op, "The note journal resource is invalid.")

    const [note] = await transaction
      .select({ userId: noteTable.userId })
      .from(noteTable)
      .innerJoin(
        organizationMemberTable,
        and(
          eq(organizationMemberTable.organizationId, options.organizationId),
          eq(organizationMemberTable.userId, noteTable.userId),
        ),
      )
      .where(eq(noteTable.id, resource.resourceId))
      .limit(1)
    if (note !== undefined) return createResult([note.userId])

    if (options.pendingUserId === undefined)
      return createResultError(op, "The note journal resource could not be authorized.")
    const [membership] = await transaction
      .select({ userId: organizationMemberTable.userId })
      .from(organizationMemberTable)
      .where(
        and(
          eq(organizationMemberTable.organizationId, options.organizationId),
          eq(organizationMemberTable.userId, options.pendingUserId),
        ),
      )
      .limit(1)
    if (membership === undefined) return createResultError(op, "The note journal resource could not be authorized.")
    return createResult([membership.userId])
  }
}
