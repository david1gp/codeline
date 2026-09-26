import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { organizationMemberRepositoryLoad } from "../db/organizationMemberRepositoryLoad.js"

export function organizationMemberLoad(
  database: Pick<DatabaseExecutor, "query">,
  userId: string,
  organizationExternalId?: string,
  issuer?: string,
): ReturnType<typeof organizationMemberRepositoryLoad> {
  return organizationMemberRepositoryLoad(database, userId, organizationExternalId, issuer)
}
