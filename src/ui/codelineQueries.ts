import { createBuilder, defineQueriesWithType, defineQuery } from "@rocicorp/zero"
import { zeroSchema } from "../database/zeroSchema.js"

const localDevelopmentUserId = "development:local-development"
const zeroQueryBuilder = createBuilder(zeroSchema)

export const codelineQueries = defineQueriesWithType<typeof zeroSchema>()({
  activeSession: defineQuery(({ args }: { args: { sessionId: string } }) =>
    zeroQueryBuilder.session
      .where("id", args.sessionId)
      .where("userId", localDevelopmentUserId)
      .where("archivedAt", "IS", null)
      .one(),
  ),
  activeSessions: defineQuery(() =>
    zeroQueryBuilder.session
      .where("userId", localDevelopmentUserId)
      .where("archivedAt", "IS", null)
      .orderBy("updatedAt", "desc")
      .orderBy("id", "desc"),
  ),
  finalizedMessages: defineQuery(({ args }: { args: { sessionId: string } }) =>
    zeroQueryBuilder.message
      .where("sessionId", args.sessionId)
      .where("finalizedAt", "IS NOT", null)
      .orderBy("sequence", "asc")
      .orderBy("id", "asc"),
  ),
})
