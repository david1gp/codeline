import { createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { identitySessionRepositoryExpire } from "../db/identitySessionRepositoryExpire.js"
import type { identitySessionTable } from "../db/identitySessionTable.js"

type IdentitySessionExpireOptions = {
  expiresAt?: Date
  now?: Date
}

/**
 * Expires one identity session at an injectable instant. Without an explicit
 * `expiresAt` the session is expired as of the injected clock, so every
 * subsequent authenticated request and every `/api/events` reconnect is rejected
 * by the same expiry predicate production uses.
 */
export async function identitySessionExpire(
  database: Pick<DatabaseExecutor, "select" | "update">,
  sessionId: string,
  options: IdentitySessionExpireOptions = {},
): Promise<Result<typeof identitySessionTable.$inferSelect>> {
  const op = "identitySessionExpire"
  if (sessionId.length === 0) return createResultError(op, "An identity session identifier is required.")
  const now = options.now ?? new Date()
  return identitySessionRepositoryExpire(database, sessionId, options.expiresAt ?? now)
}
