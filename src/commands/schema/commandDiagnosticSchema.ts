import * as path from "node:path"
import * as v from "valibot"

const commandDiagnosticAbsolutePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => path.isAbsolute(value)),
)
const commandDiagnosticRelativePathSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(4_096),
  v.check((value) => {
    if (value === ".") return true
    if (value.startsWith("/") || value.includes("\\")) return false
    return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  }),
)

export const commandDiagnosticSchema = v.pipe(
  v.strictObject({
    code: v.picklist([
      "binary-content",
      "command-limit-exceeded",
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
      "symbolic-link",
      "total-byte-budget-exceeded",
    ]),
    message: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
    path: commandDiagnosticAbsolutePathSchema,
    precedence: v.pipe(v.number(), v.integer(), v.minValue(0)),
    relativePath: commandDiagnosticRelativePathSchema,
    source: v.picklist(["global", "project"]),
  }),
  v.check(({ precedence, source }) => precedence === (source === "global" ? 0 : 1)),
)

export type CommandDiagnostic = v.InferOutput<typeof commandDiagnosticSchema>
