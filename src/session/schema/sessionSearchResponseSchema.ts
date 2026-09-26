import * as v from "valibot"

const sessionSearchRowSchema = v.object({
  session: v.object({
    id: v.string(),
    parentSessionId: v.optional(v.nullable(v.string())),
    projectPath: v.optional(v.string()),
    title: v.string(),
    updatedAt: v.optional(v.union([v.number(), v.string()])),
    pinned: v.optional(v.boolean()),
  }),
})

export const sessionSearchResponseSchema = v.object({
  nextCursor: v.nullable(v.string()),
  sessions: v.array(sessionSearchRowSchema),
})

export type SessionSearchResponse = v.InferOutput<typeof sessionSearchResponseSchema>
