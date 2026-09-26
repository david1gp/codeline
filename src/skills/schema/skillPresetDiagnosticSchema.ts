import * as path from "node:path"
import * as v from "valibot"

const skillPresetDiagnosticPathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)

const skillPresetDiagnosticRelativePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => {
    if (value.startsWith("/") || value.includes("\\")) return false
    const segments = value.split("/")
    return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  }),
)

export const skillPresetDiagnosticSchema = v.strictObject({
  code: v.picklist([
    "binary-content",
    "diagnostic-limit-exceeded",
    "directory-unavailable",
    "file-too-large",
    "file-unavailable",
    "invalid-utf8",
    "invalid-yaml",
    "invalid-preset",
    "name-mismatch",
    "not-regular-file",
    "preset-limit-exceeded",
    "reserved-name",
    "symbolic-link",
  ]),
  message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
  path: skillPresetDiagnosticPathSchema,
  relativePath: skillPresetDiagnosticRelativePathSchema,
})

export type SkillPresetDiagnostic = v.InferOutput<typeof skillPresetDiagnosticSchema>
