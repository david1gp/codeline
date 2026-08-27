import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"

const skillDescriptionCatalogNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(200),
  v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

const skillDescriptionCatalogPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => {
    if (value === ".") return true
    if (value.startsWith("/") || value.includes("\\")) return false
    const segments = value.split("/")
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  }),
)

const skillDescriptionCatalogEntrySchema = v.strictObject({
  bundlePath: skillDescriptionCatalogPathSchema,
  description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000)),
  name: skillDescriptionCatalogNameSchema,
})

export const skillDescriptionCatalogSchema = v.pipe(
  v.strictObject({
    characterCount: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.check((value) => Number.isSafeInteger(value)),
    ),
    content: v.string(),
    estimatedTokens: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.check((value) => Number.isSafeInteger(value)),
    ),
    estimatedTokensIsEstimate: v.literal(true),
    skills: v.pipe(v.array(skillDescriptionCatalogEntrySchema), v.maxLength(skillDiscoveryLimits.maximumBundles)),
    version: v.literal(1),
  }),
  v.check(({ characterCount, content }) => characterCount === content.length),
  v.check(({ estimatedTokens, characterCount }) => estimatedTokens === Math.ceil(characterCount / 4)),
  v.check(({ skills }) => new Set(skills.map(({ name }) => name)).size === skills.length),
)

export type SkillDescriptionCatalog = v.InferOutput<typeof skillDescriptionCatalogSchema>
