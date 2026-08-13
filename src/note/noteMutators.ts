import { createBuilder, defineMutatorsWithType, defineMutatorWithType } from "@rocicorp/zero"
import * as v from "valibot"
import { zeroSchema } from "../database/zeroSchema.js"

const noteBuilder = createBuilder(zeroSchema)

export type NoteMutationContext = {
  userId: string
}

const defineNoteMutator = defineMutatorWithType<typeof zeroSchema, NoteMutationContext>()
const defineNoteMutators = defineMutatorsWithType<typeof zeroSchema>()

const noteCreateArgsSchema = v.object({
  id: v.string(),
  content: v.string(),
  projectPath: v.nullable(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const noteUpdateArgsSchema = v.object({
  id: v.string(),
  content: v.string(),
  projectPath: v.nullable(v.string()),
  updatedAt: v.number(),
})

export const noteMutators = defineNoteMutators({
  note: {
    create: defineNoteMutator(noteCreateArgsSchema, async ({ args, ctx, tx }) => {
      await tx.mutate.note.insert({
        id: args.id,
        userId: ctx.userId,
        content: args.content,
        projectPath: args.projectPath,
        createdAt: args.createdAt,
        updatedAt: args.updatedAt,
      })
    }),
    update: defineNoteMutator(noteUpdateArgsSchema, async ({ args, ctx, tx }) => {
      const existing = await tx.run(noteBuilder.note.where("id", args.id).where("userId", ctx.userId).one())
      if (existing === undefined) throw new Error("The note could not be found.")

      await tx.mutate.note.update({
        id: args.id,
        content: args.content,
        projectPath: args.projectPath,
        updatedAt: args.updatedAt,
      })
    }),
    delete: defineNoteMutator(v.string(), async ({ args, ctx, tx }) => {
      const existing = await tx.run(noteBuilder.note.where("id", args).where("userId", ctx.userId).one())
      if (existing === undefined) throw new Error("The note could not be found.")

      await tx.mutate.note.delete({ id: args })
    }),
  },
})
