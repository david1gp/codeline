import * as path from "node:path"
import * as v from "valibot"

const skillDiagnosticAbsolutePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)

const skillDiagnosticRelativePathSchema = v.pipe(
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

const skillDiagnosticCodeSchema = v.picklist([
  "binary-content",
  "bundle-limit-exceeded",
  "diagnostic-limit-exceeded",
  "directory-entry-limit-exceeded",
  "directory-unavailable",
  "file-too-large",
  "file-unavailable",
  "frontmatter-missing",
  "invalid-frontmatter",
  "invalid-name",
  "invalid-utf8",
  "not-regular-file",
  "resource-limit-exceeded",
  "snapshot-limit-exceeded",
  "symbolic-link",
  "total-byte-budget-exceeded",
])

export const skillDiagnosticSchema = v.pipe(
  v.strictObject({
    bundlePath: v.optional(skillDiagnosticRelativePathSchema),
    code: skillDiagnosticCodeSchema,
    message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
    path: skillDiagnosticAbsolutePathSchema,
    precedence: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.check((value) => Number.isSafeInteger(value)),
    ),
    relativePath: skillDiagnosticRelativePathSchema,
    source: v.picklist(["global", "project"]),
  }),
  v.check(({ precedence, source }) => precedence === (source === "global" ? 0 : 1)),
)

export type SkillDiagnostic = v.InferOutput<typeof skillDiagnosticSchema>
