import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"
import { skillPresetDiagnosticSchema } from "./skillPresetDiagnosticSchema.js"
import { skillPresetSchema } from "./skillPresetSchema.js"

const skillPresetCatalogDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))

export const skillPresetCatalogSchema = v.pipe(
  v.strictObject({
    diagnostics: v.pipe(v.array(skillPresetDiagnosticSchema), v.maxLength(skillDiscoveryLimits.maximumDiagnostics)),
    digest: skillPresetCatalogDigestSchema,
    presets: v.pipe(v.array(skillPresetSchema), v.maxLength(skillDiscoveryLimits.maximumBundles)),
    version: v.literal(1),
  }),
  v.check(({ presets }) => new Set(presets.map(({ name }) => name)).size === presets.length),
)

export type SkillPresetCatalog = v.InferOutput<typeof skillPresetCatalogSchema>
