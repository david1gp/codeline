import { createHash } from "node:crypto"
import * as path from "node:path"
import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"
import { skillResourceSchema } from "./skillResourceSchema.js"

const skillSnapshotAbsolutePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)

const skillSnapshotRelativePathSchema = v.pipe(
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

const skillSnapshotDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))
const skillSnapshotSourceSchema = v.picklist(["global", "project"])
const skillSnapshotPrecedenceSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)
const skillSnapshotByteSizeSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(0),
  v.check((value) => Number.isSafeInteger(value)),
)

export const skillSnapshotSchema = v.pipe(
  v.strictObject({
    body: v.string(),
    bundleDigest: skillSnapshotDigestSchema,
    bundlePath: skillSnapshotRelativePathSchema,
    canonicalPath: skillSnapshotAbsolutePathSchema,
    content: v.pipe(
      v.string(),
      v.check((value) => !value.includes("\0")),
      v.check((value) => Buffer.byteLength(value, "utf8") <= skillDiscoveryLimits.maximumFileBytes),
    ),
    description: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2_000)),
    digest: skillSnapshotDigestSchema,
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200), v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
    precedence: skillSnapshotPrecedenceSchema,
    resources: v.pipe(v.array(skillResourceSchema), v.maxLength(skillDiscoveryLimits.maximumResourcesPerBundle)),
    size: skillSnapshotByteSizeSchema,
    source: skillSnapshotSourceSchema,
  }),
  v.check(({ content, digest }) => digest === `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`),
  v.check(({ content, size }) => Buffer.byteLength(content, "utf8") === size),
  v.check(({ precedence, source }) => precedence === (source === "global" ? 0 : 1)),
  v.check(
    ({ content, resources }) =>
      Buffer.byteLength(content, "utf8") + resources.reduce((total, resource) => total + resource.size, 0) <=
      skillDiscoveryLimits.maximumTotalBytes,
  ),
  v.check(
    ({ resources }) => new Set(resources.map(({ path: resourcePath }) => resourcePath)).size === resources.length,
  ),
  v.check(({ resources }) =>
    resources.every((resource, index) => index === 0 || resources[index - 1]!.path < resource.path),
  ),
  v.check(({ canonicalPath, resources }) => {
    const bundleDirectory = path.dirname(canonicalPath)
    return resources.every((resource) => {
      const resolved = path.resolve(bundleDirectory, ...resource.path.split("/"))
      const relative = path.relative(bundleDirectory, resolved)
      return relative === resource.path.split("/").join(path.sep) && !path.isAbsolute(relative)
    })
  }),
  v.check(({ bundleDigest, description, name, digest, resources }) => {
    const stable = JSON.stringify({
      description,
      name,
      resources: resources.map(({ digest: resourceDigest, path: resourcePath, size }) => ({
        digest: resourceDigest,
        path: resourcePath,
        size,
      })),
      skillDigest: digest,
    })
    return bundleDigest === `sha256-${createHash("sha256").update(stable, "utf8").digest("hex")}`
  }),
)

export type SkillSnapshot = v.InferOutput<typeof skillSnapshotSchema>
