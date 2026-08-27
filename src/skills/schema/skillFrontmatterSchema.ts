import * as v from "valibot"

const skillFrontmatterNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

const skillFrontmatterDescriptionSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000))

export const skillFrontmatterSchema = v.strictObject({
  description: skillFrontmatterDescriptionSchema,
  name: skillFrontmatterNameSchema,
})

export type SkillFrontmatter = v.InferOutput<typeof skillFrontmatterSchema>
