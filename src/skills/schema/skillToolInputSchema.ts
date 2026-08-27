import * as v from "valibot"

const skillToolNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

const skillToolResourcePathSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => {
    if (value.startsWith("/") || value.includes("\\")) return false
    const segments = value.split("/")
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  }),
)

export const skillToolInputSchema = v.pipe(
  v.strictObject({
    name: skillToolNameSchema,
    path: v.optional(skillToolResourcePathSchema),
    resourcePath: v.optional(skillToolResourcePathSchema),
  }),
  v.check(({ path, resourcePath }) => path === undefined || resourcePath === undefined),
)

export type SkillToolInput = v.InferOutput<typeof skillToolInputSchema>
