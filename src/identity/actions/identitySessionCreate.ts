import { randomBytes } from "node:crypto"
import { createResult, type Result } from "@adaptive-ds/result"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { identitySessionRepositoryCreate } from "../db/identitySessionRepositoryCreate.js"
import { identitySessionTable } from "../db/identitySessionTable.js"

const identitySessionLifetimeMs = 12 * 60 * 60 * 1000

type IdentitySessionCreateOptions = {
  credentialCreate?: () => string
  idCreate?: () => string
  now?: Date
}

export async function identitySessionCreate(
  database: Pick<DatabaseExecutor, "insert">,
  userId: string,
  options: IdentitySessionCreateOptions = {},
): Promise<Result<{ session: typeof identitySessionTable.$inferSelect; token: string }>> {
  const now = options.now ?? new Date()
  const token = options.credentialCreate?.() ?? randomBytes(32).toString("base64url")
  const storedSession = await identitySessionRepositoryCreate(database, {
    expiresAt: new Date(now.getTime() + identitySessionLifetimeMs),
    id: options.idCreate?.() ?? uuidv7(),
    token,
    userId,
  })
  if (!storedSession.success) return storedSession
  return createResult({ session: storedSession.data, token })
}
