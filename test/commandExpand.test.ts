import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { commandArgumentsTokenize } from "../src/commands/actions/commandArgumentsTokenize.js"
import { commandExpand } from "../src/commands/actions/commandExpand.js"
import { commandInvocationParse } from "../src/commands/actions/commandInvocationParse.js"
import {
  commandTemplateExpand,
  commandTemplatePlaceholderNames,
} from "../src/commands/actions/commandTemplateExpand.js"

const digest = `sha256-${createHash("sha256").update("digest").digest("hex")}`
const catalogDigest = `sha256-${createHash("sha256").update("catalog").digest("hex")}`

function commandSnapshotCreate(body: string, overrides: Record<string, unknown> = {}) {
  return {
    body,
    canonicalPath: "/tmp/project/.agents/commands/demo.md",
    digest,
    name: "demo",
    precedence: 1,
    relativePath: "demo.md",
    size: body.length,
    source: "project" as const,
    templateDigest: digest,
    ...overrides,
  }
}

function expandText(template: string, args: string): string | undefined {
  const tokenized = commandArgumentsTokenize(args)
  if (!tokenized.success) return undefined
  const expanded = commandTemplateExpand(template, tokenized.data.text, tokenized.data.values)
  return expanded.success ? expanded.data : undefined
}

test("tokenizes plain, quoted, escaped, and multiline arguments", () => {
  expect(commandArgumentsTokenize("alpha beta")).toMatchObject({
    success: true,
    data: { text: "alpha beta", values: ["alpha", "beta"] },
  })
  expect(commandArgumentsTokenize('"alpha beta" gamma')).toMatchObject({
    success: true,
    data: { values: ["alpha beta", "gamma"] },
  })
  expect(commandArgumentsTokenize("'alpha beta' gamma")).toMatchObject({
    success: true,
    data: { values: ["alpha beta", "gamma"] },
  })
  expect(commandArgumentsTokenize("alpha\\ beta")).toMatchObject({ success: true, data: { values: ["alpha beta"] } })
  expect(commandArgumentsTokenize('"a\\"b"')).toMatchObject({ success: true, data: { values: ['a"b'] } })
  expect(commandArgumentsTokenize("first\nsecond")).toMatchObject({
    success: true,
    data: { text: "first\nsecond", values: ["first", "second"] },
  })
  // An empty quoted token stays a token so positional placeholders keep their index.
  expect(commandArgumentsTokenize('"" tail')).toMatchObject({ success: true, data: { values: ["", "tail"] } })
  expect(commandArgumentsTokenize(undefined)).toMatchObject({ success: true, data: { text: "", values: [] } })
  expect(commandArgumentsTokenize(["alpha", "beta"])).toMatchObject({
    success: true,
    data: { text: "alpha beta", values: ["alpha", "beta"] },
  })
})

test("rejects unterminated quotes, dangling escapes, and oversized argument text", () => {
  expect(commandArgumentsTokenize('"unterminated')).toMatchObject({ success: false })
  expect(commandArgumentsTokenize("'unterminated")).toMatchObject({ success: false })
  expect(commandArgumentsTokenize("trailing\\")).toMatchObject({ success: false })
  expect(commandArgumentsTokenize("a\0b")).toMatchObject({ success: false })
  expect(commandArgumentsTokenize("x".repeat(100_001))).toMatchObject({ success: false })
})

test("substitutes $ARGUMENTS and its braced form with the raw argument text", () => {
  const bracedArguments = ["$", "{ARGUMENTS}"].join("")
  expect(expandText("Fix $ARGUMENTS now.", 'the "big bug"')).toBe('Fix the "big bug" now.')
  expect(expandText(`Fix ${bracedArguments} now.`, "one two")).toBe("Fix one two now.")
  expect(expandText("Fix $ARGUMENTS now.", "")).toBe("Fix  now.")
})

test("substitutes positional placeholders and folds the trailing rest into the last one", () => {
  const bracedOne = ["$", "{1}"].join("")
  expect(expandText("Review $1 for $2.", "alpha beta")).toBe("Review alpha for beta.")
  expect(expandText("Review $1 for $2.", "alpha beta gamma")).toBe("Review alpha for beta gamma.")
  expect(expandText(`Review ${bracedOne} only.`, "alpha beta")).toBe("Review alpha beta only.")
  // A missing positional argument expands to empty text rather than failing.
  expect(expandText("Review $1 for $2.", "alpha")).toBe("Review alpha for .")
  expect(commandTemplateExpand("Bad $0 placeholder.", "", [])).toMatchObject({ success: false })
})

test("appends arguments implicitly when the template declares no placeholder", () => {
  expect(expandText("Run the audit.", "on the parser")).toBe("Run the audit.\n\non the parser")
  expect(expandText("Run the audit.", "")).toBe("Run the audit.")
  expect(expandText("Run the audit.", "first\nsecond")).toBe("Run the audit.\n\nfirst\nsecond")
  // A template with a placeholder never also appends.
  expect(expandText("Run $1.", "alpha beta")).toBe("Run alpha beta.")
})

test("reports the declared placeholder names in first-occurrence order", () => {
  const bracedPlaceholders = ["$", "{ARGUMENTS} and $", "{3}"].join("")
  expect(commandTemplatePlaceholderNames("$2 then $1 then $2 then $ARGUMENTS")).toEqual(["2", "1", "ARGUMENTS"])
  expect(commandTemplatePlaceholderNames("no placeholders")).toEqual([])
  expect(commandTemplatePlaceholderNames(bracedPlaceholders)).toEqual(["ARGUMENTS", "3"])
})

test("rejects templates that expand to empty or oversized text", () => {
  expect(commandTemplateExpand("$ARGUMENTS", "", [])).toMatchObject({ success: false })
  expect(commandTemplateExpand("   ", "", [])).toMatchObject({ success: false })
  expect(commandTemplateExpand("$ARGUMENTS", "x".repeat(100_001), [])).toMatchObject({ success: false })
})

test("commandExpand returns typed expansion, overrides, and digests", () => {
  const expanded = commandExpand({
    arguments: 'alpha "beta gamma"',
    catalogDigest,
    command: commandSnapshotCreate("Review $1 and $2.", {
      agent: "reviewer",
      model: "cliproxyapi/opus",
      subtask: true,
    }),
  })

  expect(expanded).toMatchObject({
    success: true,
    data: {
      arguments: ["alpha", "beta gamma"],
      argumentsText: 'alpha "beta gamma"',
      catalogDigest,
      commandName: "demo",
      expandedText: "Review alpha and beta gamma.",
      overrides: { agent: "reviewer", model: "cliproxyapi/opus", subtask: true },
      templateDigest: digest,
      version: 1,
    },
  })
})

test("commandExpand omits absent overrides and rejects invalid input", () => {
  const plain = commandExpand({ command: commandSnapshotCreate("Plain template.") })
  expect(plain.success).toBe(true)
  if (plain.success) expect(plain.data.overrides).toEqual({})

  expect(commandExpand({ command: { name: "demo" } })).toMatchObject({ success: false })
  expect(commandExpand({ catalogDigest: "not-a-digest", command: commandSnapshotCreate("Body.") })).toMatchObject({
    success: false,
  })
  expect(commandExpand({ arguments: '"unterminated', command: commandSnapshotCreate("Body $1.") })).toMatchObject({
    success: false,
  })
})

test("parses slash invocations into a typed name and raw arguments", () => {
  expect(commandInvocationParse("/review alpha beta")).toMatchObject({
    success: true,
    data: { arguments: "alpha beta", name: "review" },
  })
  expect(commandInvocationParse("/git/commit")).toMatchObject({
    success: true,
    data: { arguments: "", name: "git/commit" },
  })
  expect(commandInvocationParse("  /review   alpha  ")).toMatchObject({
    success: true,
    data: { arguments: "alpha", name: "review" },
  })
  expect(commandInvocationParse("/review first\nsecond")).toMatchObject({
    success: true,
    data: { arguments: "first\nsecond" },
  })
  // Ordinary prose is not a command invocation.
  expect(commandInvocationParse("review alpha")).toMatchObject({ success: true, data: null })
  expect(commandInvocationParse("")).toMatchObject({ success: true, data: null })
})

test("rejects invalid command invocations", () => {
  expect(commandInvocationParse("/Review")).toMatchObject({ success: false })
  expect(commandInvocationParse("/")).toMatchObject({ success: false })
  expect(commandInvocationParse("/../escape")).toMatchObject({ success: false })
  expect(commandInvocationParse("/a\0b")).toMatchObject({ success: false })
})
