import { createBuilder, defineMutatorsWithType, defineMutatorWithType, type Transaction } from "@rocicorp/zero"
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

const noteReorderArgsSchema = v.object({
  direction: v.picklist(["up", "down"]),
  id: v.string(),
  projectPath: v.nullable(v.string()),
})

type NoteTransaction = Transaction<typeof zeroSchema>

type NoteRow = {
  id: string
  projectPath?: string | null
  sortOrder?: number | null
  updatedAt: number
}

async function noteRowsRead(tx: NoteTransaction, userId: string): Promise<NoteRow[]> {
  return tx.run(noteBuilder.note.where("userId", userId))
}

function noteProjectPathNormalize(projectPath: string | null | undefined): string | null {
  return projectPath ?? null
}

function noteSortOrderRead(sortOrder: number | null | undefined): number | undefined {
  return typeof sortOrder === "number" && Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : undefined
}

function noteRowsCompare(left: NoteRow, right: NoteRow): number {
  const leftSortOrder = noteSortOrderRead(left.sortOrder)
  const rightSortOrder = noteSortOrderRead(right.sortOrder)
  if (leftSortOrder !== undefined && rightSortOrder !== undefined && leftSortOrder !== rightSortOrder) {
    return leftSortOrder - rightSortOrder
  }
  if (leftSortOrder !== undefined && rightSortOrder === undefined) return -1
  if (leftSortOrder === undefined && rightSortOrder !== undefined) return 1
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
  if (left.id === right.id) return 0
  return left.id > right.id ? -1 : 1
}

function noteProjectRowsRead(notes: NoteRow[], projectPath: string | null): NoteRow[] {
  return notes.filter((note) => noteProjectPathNormalize(note.projectPath) === projectPath).sort(noteRowsCompare)
}

async function noteProjectRowsCompact(tx: NoteTransaction, notes: NoteRow[]): Promise<void> {
  for (const [sortOrder, note] of notes.entries()) {
    if (noteSortOrderRead(note.sortOrder) === sortOrder) continue
    await tx.mutate.note.update({ id: note.id, sortOrder })
  }
}

export const noteMutators = defineNoteMutators({
  note: {
    create: defineNoteMutator(noteCreateArgsSchema, async ({ args, ctx, tx }) => {
      const notes = await noteRowsRead(tx, ctx.userId)
      const projectNotes = noteProjectRowsRead(notes, args.projectPath)
      await noteProjectRowsCompact(tx, projectNotes)

      await tx.mutate.note.insert({
        id: args.id,
        userId: ctx.userId,
        content: args.content,
        projectPath: args.projectPath,
        sortOrder: projectNotes.length,
        createdAt: args.createdAt,
        updatedAt: args.updatedAt,
      })
    }),
    update: defineNoteMutator(noteUpdateArgsSchema, async ({ args, ctx, tx }) => {
      const notes = await noteRowsRead(tx, ctx.userId)
      const existing = notes.find((note) => note.id === args.id)
      if (existing === undefined) throw new Error("The note could not be found.")

      const currentProjectPath = noteProjectPathNormalize(existing.projectPath)
      if (currentProjectPath === args.projectPath) {
        const projectNotes = noteProjectRowsRead(notes, currentProjectPath)
        const sortOrder = projectNotes.findIndex((note) => note.id === existing.id)
        await noteProjectRowsCompact(tx, projectNotes)
        await tx.mutate.note.update({
          id: args.id,
          content: args.content,
          projectPath: args.projectPath,
          sortOrder,
          updatedAt: args.updatedAt,
        })
        return
      }

      const sourceNotes = noteProjectRowsRead(notes, currentProjectPath).filter((note) => note.id !== existing.id)
      const destinationNotes = noteProjectRowsRead(notes, args.projectPath)
      await noteProjectRowsCompact(tx, sourceNotes)
      await noteProjectRowsCompact(tx, destinationNotes)
      await tx.mutate.note.update({
        id: args.id,
        content: args.content,
        projectPath: args.projectPath,
        sortOrder: destinationNotes.length,
        updatedAt: args.updatedAt,
      })
    }),
    delete: defineNoteMutator(v.string(), async ({ args, ctx, tx }) => {
      const notes = await noteRowsRead(tx, ctx.userId)
      const existing = notes.find((note) => note.id === args)
      if (existing === undefined) throw new Error("The note could not be found.")

      const projectNotes = noteProjectRowsRead(notes, noteProjectPathNormalize(existing.projectPath)).filter(
        (note) => note.id !== existing.id,
      )
      await noteProjectRowsCompact(tx, projectNotes)
      await tx.mutate.note.delete({ id: args })
    }),
    reorder: defineNoteMutator(noteReorderArgsSchema, async ({ args, ctx, tx }) => {
      const notes = await noteRowsRead(tx, ctx.userId)
      const existing = notes.find((note) => note.id === args.id)
      if (existing === undefined) throw new Error("The note could not be found.")
      if (noteProjectPathNormalize(existing.projectPath) !== args.projectPath) {
        throw new Error("The note does not belong to the requested project.")
      }

      const projectNotes = noteProjectRowsRead(notes, args.projectPath)
      const currentIndex = projectNotes.findIndex((note) => note.id === existing.id)
      await noteProjectRowsCompact(tx, projectNotes)

      const adjacentIndex = currentIndex + (args.direction === "up" ? -1 : 1)
      const adjacent = projectNotes[adjacentIndex]
      if (currentIndex < 0 || adjacent === undefined) return

      await tx.mutate.note.update({ id: adjacent.id, sortOrder: currentIndex })
      await tx.mutate.note.update({ id: existing.id, sortOrder: adjacentIndex })
    }),
  },
})
