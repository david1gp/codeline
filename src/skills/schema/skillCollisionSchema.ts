import * as path from "node:path"
import * as v from "valibot"

const skillCollisionPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)

const skillCollisionCandidateSchema = v.pipe(
  v.strictObject({
    bundlePath: v.pipe(v.string(), v.minLength(1), v.maxLength(4_096)),
    canonicalPath: skillCollisionPathSchema,
    digest: v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/)),
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

export const skillCollisionSchema = v.strictObject({
  candidates: v.pipe(v.array(skillCollisionCandidateSchema), v.minLength(2)),
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  winner: skillCollisionCandidateSchema,
})

export type SkillCollision = v.InferOutput<typeof skillCollisionSchema>
