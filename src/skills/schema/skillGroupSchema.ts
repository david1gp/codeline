import * as v from "valibot"

const skillGroupPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => {
    if (value.startsWith("/") || value.includes("\\")) return false
    const segments = value.split("/")
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  }),
)

export const skillGroupSchema = v.pipe(
  v.strictObject({
    path: skillGroupPathSchema,
    precedence: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.check((value) => Number.isSafeInteger(value)),
    ),
    source: v.picklist(["global", "project"]),
  }),
  v.check(({ precedence, source }) => precedence === (source === "global" ? 0 : 1)),
)

export type SkillGroup = v.InferOutput<typeof skillGroupSchema>
