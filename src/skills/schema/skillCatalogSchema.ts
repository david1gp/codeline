import * as path from "node:path"
import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"
import { skillCollisionSchema } from "./skillCollisionSchema.js"
import { skillDiagnosticSchema } from "./skillDiagnosticSchema.js"
import { skillGroupSchema } from "./skillGroupSchema.js"
import { skillSnapshotSchema } from "./skillSnapshotSchema.js"

const skillCatalogRootSchema = v.pipe(
  v.strictObject({
    canonicalPath: v.pipe(
      v.string(),
      v.minLength(1),
      v.maxLength(4_096),
      v.check((value) => path.isAbsolute(value)),
    ),
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

const skillCatalogDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))

export const skillCatalogSchema = v.pipe(
  v.strictObject({
    bundles: v.pipe(v.array(skillSnapshotSchema), v.maxLength(skillDiscoveryLimits.maximumBundles)),
    collisions: v.pipe(v.array(skillCollisionSchema), v.maxLength(skillDiscoveryLimits.maximumBundles)),
    diagnostics: v.pipe(v.array(skillDiagnosticSchema), v.maxLength(skillDiscoveryLimits.maximumDiagnostics)),
    digest: skillCatalogDigestSchema,
    groups: v.pipe(v.array(skillGroupSchema), v.maxLength(skillDiscoveryLimits.maximumDirectories)),
    roots: v.pipe(v.array(skillCatalogRootSchema), v.maxLength(2)),
    skills: v.pipe(v.array(skillSnapshotSchema), v.maxLength(skillDiscoveryLimits.maximumBundles)),
    version: v.literal(1),
  }),
  v.check(({ bundles }) => new Set(bundles.map(({ canonicalPath }) => canonicalPath)).size === bundles.length),
  v.check(({ skills }) => new Set(skills.map(({ name }) => name)).size === skills.length),
  v.check(({ groups }) => {
    const identities = groups.map(({ path: groupPath, source }) => `${source}:${groupPath}`)
    return new Set(identities).size === identities.length
  }),
  v.check(({ roots }) => new Set(roots.map(({ source }) => source)).size === roots.length),
  v.check(
    ({ bundles }) =>
      bundles.reduce(
        (total, bundle) =>
          total + bundle.size + bundle.resources.reduce((resourceTotal, resource) => resourceTotal + resource.size, 0),
        0,
      ) <= skillDiscoveryLimits.maximumTotalBytes,
  ),
  v.check(({ bundles, skills }) => {
    const bundlePaths = new Set(bundles.map(({ canonicalPath }) => canonicalPath))
    return skills.every(({ canonicalPath }) => bundlePaths.has(canonicalPath))
  }),
)

export type SkillCatalog = v.InferOutput<typeof skillCatalogSchema>
