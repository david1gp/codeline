import type { Result } from "@adaptive-ds/result"
import type { DatabaseTransaction } from "../../database/databaseClient.js"
import type { JournalEventResource } from "../schema/journalEventResourceSchema.js"

/**
 * A migrated domain must supply this resolver from its concrete authorization tables.
 * The resolver always receives the journal transaction so authorization and the domain
 * mutation can share one snapshot/lock order. The journal layer deliberately does not
 * guess a generic production authorization query before those domains are migrated.
 */
export type JournalEventRecipientResolver = (
  transaction: DatabaseTransaction,
  resource: JournalEventResource,
) => Promise<Result<readonly string[]>>
