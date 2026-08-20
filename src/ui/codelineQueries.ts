import { createBuilder, defineQueriesWithType, defineQuery } from "@rocicorp/zero"
import { zeroSchema } from "../database/zeroSchema.js"

const zeroQueryBuilder = createBuilder(zeroSchema)
type CodelineQueryContext = { userId: string }
type ActiveSessionsQueryArgs = {
  limit: number
  start: { id: string; updatedAt: number } | null
}

export const codelineQueries = defineQueriesWithType<typeof zeroSchema>()({
  activeSession: defineQuery(({ args, ctx }: { args: { sessionId: string }; ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.session
      .where("id", args.sessionId)
      .where("userId", ctx.userId)
      .where("archivedAt", "IS", null)
      .one(),
  ),
  activeSessions: defineQuery(({ args, ctx }: { args: ActiveSessionsQueryArgs; ctx: CodelineQueryContext }) => {
    let query = zeroQueryBuilder.session
      .where("userId", ctx.userId)
      .where("archivedAt", "IS", null)
      .orderBy("updatedAt", "desc")
      .orderBy("id", "desc")
    if (args.start !== null) query = query.start(args.start)
    return query.limit(args.limit)
  }),
  activeRuns: defineQuery(({ ctx }: { ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.run
      .where("userId", ctx.userId)
      .where("status", "IN", ["accepted", "running"])
      .orderBy("updatedAt", "desc")
      .orderBy("id", "desc"),
  ),
  finalizedMessages: defineQuery(({ args, ctx }: { args: { sessionId: string }; ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.message
      .where("sessionId", args.sessionId)
      .whereExists("session", (session) => session.where("userId", ctx.userId))
      .where("finalizedAt", "IS NOT", null)
      .orderBy("sequence", "asc")
      .orderBy("id", "asc"),
  ),
  latestSessionRun: defineQuery(({ args, ctx }: { args: { sessionId: string }; ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.run
      .where("sessionId", args.sessionId)
      .where("userId", ctx.userId)
      .orderBy("createdAt", "desc")
      .orderBy("id", "desc")
      .related("attempts", (attempts) => attempts.orderBy("ordinal", "asc"))
      .one(),
  ),
  sessionRuns: defineQuery(({ args, ctx }: { args: { sessionId: string }; ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.run
      .where("sessionId", args.sessionId)
      .where("userId", ctx.userId)
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc")
      .related("attempts", (attempts) => attempts.orderBy("ordinal", "asc")),
  ),
  sessionDelegations: defineQuery(({ args, ctx }: { args: { sessionId: string }; ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.runDelegation
      .where("sessionId", args.sessionId)
      .where("userId", ctx.userId)
      .orderBy("createdAt", "asc")
      .orderBy("id", "asc"),
  ),
  note: defineQuery(({ args, ctx }: { args: { noteId: string }; ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.note.where("id", args.noteId).where("userId", ctx.userId).one(),
  ),
  sessionStreamEvents: defineQuery(({ args, ctx }: { args: { sessionId: string }; ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.streamEvent
      .where("sessionId", args.sessionId)
      .whereExists("session", (session) => session.where("userId", ctx.userId))
      .orderBy("streamId", "asc")
      .orderBy("sequence", "asc"),
  ),
  notes: defineQuery(({ ctx }: { ctx: CodelineQueryContext }) =>
    zeroQueryBuilder.note
      .where("userId", ctx.userId)
      .orderBy("sortOrder", "asc")
      .orderBy("updatedAt", "desc")
      .orderBy("id", "desc"),
  ),
})
