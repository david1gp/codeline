import { createHash } from "node:crypto"
import * as path from "node:path"
import * as v from "valibot"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"

const skillResourcePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => {
    if (path.isAbsolute(value) || value.includes("\\")) return false
    const segments = value.split("/")
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  }),
)

const skillResourceAbsolutePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)

const skillResourceDigestSchema = v.pipe(v.string(), v.regex(/^sha256-[a-f0-9]{64}$/))

export const skillResourceSchema = v.pipe(
  v.strictObject({
    canonicalPath: skillResourceAbsolutePathSchema,
    content: v.pipe(
      v.string(),
      v.check((value) => !value.includes("\0")),
      v.check((value) => Buffer.byteLength(value, "utf8") <= skillDiscoveryLimits.maximumFileBytes),
    ),
    digest: skillResourceDigestSchema,
    path: skillResourcePathSchema,
    size: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.check((value) => Number.isSafeInteger(value)),
    ),
  }),
  v.check(({ content, digest }) => digest === `sha256-${createHash("sha256").update(content, "utf8").digest("hex")}`),
  v.check(({ content, size }) => Buffer.byteLength(content, "utf8") === size),
)

export type SkillResource = v.InferOutput<typeof skillResourceSchema>
