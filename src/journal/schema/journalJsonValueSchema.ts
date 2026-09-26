import * as v from "valibot"

export type JournalJsonValue =
  | null
  | boolean
  | number
  | string
  | JournalJsonValue[]
  | { [key: string]: JournalJsonValue }

const finiteNumberSchema = v.pipe(
  v.number(),
  v.check((value) => Number.isFinite(value), "The journal JSON number must be finite."),
)

const journalJsonValueSchemaInternal: ReturnType<typeof v.lazy> = v.lazy(() =>
  v.union([
    v.null(),
    v.boolean(),
    finiteNumberSchema,
    v.string(),
    v.array(journalJsonValueSchemaInternal),
    v.record(v.string(), journalJsonValueSchemaInternal),
  ]),
)

export const journalJsonValueSchema = journalJsonValueSchemaInternal
