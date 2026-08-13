import * as v from "valibot"

const sessionSearchRowSchema = v.object({
  session: v.object({
    id: v.string(),
    title: v.string(),
  }),
})

export const sessionSearchResponseSchema = v.object({
  nextCursor: v.nullable(v.string()),
  sessions: v.array(sessionSearchRowSchema),
})

export type SessionSearchResponse = v.InferOutput<typeof sessionSearchResponseSchema>
