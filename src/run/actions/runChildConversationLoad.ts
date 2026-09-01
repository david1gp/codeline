import type { DatabaseClient } from "../../database/databaseClient.js"
import { runRepositoryChildConversationLoad } from "../db/runRepositoryChildConversationLoad.js"

export function runChildConversationLoad(
  database: DatabaseClient,
  userId: string,
  organizationId: string,
  parentSessionId: string,
  childRunId: string,
  delegationId: string,
): ReturnType<typeof runRepositoryChildConversationLoad> {
  return runRepositoryChildConversationLoad(database, userId, organizationId, parentSessionId, childRunId, delegationId)
}
