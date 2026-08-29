import * as v from "valibot"

const readToolFilePathSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => !value.includes("\0")),
)
const readToolOffsetSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(Number.MAX_SAFE_INTEGER))
const readToolLimitSchema = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2_000))

export const readToolInputSchema = v.strictObject({
  file_path: readToolFilePathSchema,
  limit: v.optional(readToolLimitSchema),
  offset: v.optional(readToolOffsetSchema),
})

export type ReadToolInput = v.InferOutput<typeof readToolInputSchema>
