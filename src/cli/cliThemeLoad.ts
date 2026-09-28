import { access, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { cliThemePathResolve } from "./cliThemePathResolve.js"
import { type CliTheme, type CliThemeColorValue, cliThemeSchema } from "./cliThemeSchema.js"
import dark from "./themes/dark.json" with { type: "json" }
import light from "./themes/light.json" with { type: "json" }

export type ResolvedCliTheme = {
  theme: CliTheme
  colors: Record<string, string | number>
  export: Record<string, string | number> | undefined
  sourcePath: string
}

function themeCandidatePaths(selection: string, environment: NodeJS.ProcessEnv): string[] {
  const codelineThemes = cliThemePathResolve(environment)
  const piAgentDir = environment.PI_CODING_AGENT_DIR || join(environment.HOME || homedir(), ".pi", "agent")
  const piThemes = join(piAgentDir, "themes")
  const projectThemes = join(process.cwd(), ".pi", "themes")
  if (isAbsolute(selection) || selection.includes("/") || selection.endsWith(".json")) {
    return [resolve(selection)]
  }
  return [
    join(codelineThemes, `${selection}.json`),
    join(piThemes, `${selection}.json`),
    join(projectThemes, `${selection}.json`),
  ]
}

function variableResolve(
  value: CliThemeColorValue,
  vars: Record<string, CliThemeColorValue>,
  visited = new Set<string>(),
): string | number {
  if (
    typeof value === "number" ||
    value === "" ||
    value === "default" ||
    value.startsWith("#") ||
    /^ok(lch|hsl)\(/i.test(value)
  )
    return value
  if (visited.has(value)) throw new Error(`Circular theme variable reference: ${value}`)
  if (!(value in vars)) throw new Error(`Theme variable reference not found: ${value}`)
  const reference = vars[value]
  if (reference === undefined) throw new Error(`Theme variable reference not found: ${value}`)
  const next = new Set(visited)
  next.add(value)
  return variableResolve(reference, vars, next)
}

function colorsResolve(theme: CliTheme): Record<string, string | number> {
  const colors = { ...theme.colors }
  colors.scrollbarTrack ??= colors.muted
  colors.scrollbarThumb ??= colors.text
  colors.thinkingMax ??= colors.thinkingXhigh
  colors.searchMatchBg ??= colors.selectedBg
  colors.searchMatchText ??= colors.text
  return Object.fromEntries(
    Object.entries(colors).map(([name, value]) => [name, variableResolve(value, theme.vars ?? {})]),
  )
}

function themeDocumentResolve(document: unknown, filePath: string): Result<ResolvedCliTheme> {
  const op = "cliThemeLoad"
  const parsed = v.safeParse(cliThemeSchema, document)
  if (!parsed.success) return createResultError(op, `Invalid Pi theme ${filePath}: ${v.summarize(parsed.issues)}`)
  try {
    const theme = parsed.output
    const colors = colorsResolve(theme)
    const exportColors = theme.export
      ? Object.fromEntries(
          Object.entries(theme.export)
            .filter((entry): entry is [string, CliThemeColorValue] => entry[1] !== undefined)
            .map(([name, value]) => [name, variableResolve(value, theme.vars ?? {})]),
        )
      : undefined
    return createResult({ theme, colors, export: exportColors, sourcePath: filePath })
  } catch (error) {
    return createResultError(op, `Could not resolve theme ${filePath}: ${String(error)}`)
  }
}

async function themeFileLoad(filePath: string): Promise<Result<ResolvedCliTheme>> {
  const op = "cliThemeLoad"
  let contents: string
  try {
    contents = await readFile(filePath, "utf8")
  } catch (error) {
    return createResultError(op, `Could not read theme file ${filePath}: ${String(error)}`)
  }
  try {
    return themeDocumentResolve(JSON.parse(contents.replace(/^\uFEFF/, "")), filePath)
  } catch (error) {
    return createResultError(op, `Could not parse theme file ${filePath}: ${String(error)}`)
  }
}

export async function cliThemeLoad(
  selection: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Result<ResolvedCliTheme>> {
  const op = "cliThemeLoad"
  const candidates = themeCandidatePaths(selection, environment)
  if (candidates.length === 1) {
    const explicitPath = candidates[0]
    if (!explicitPath) return createResultError(op, `Theme not found: ${selection}`)
    return themeFileLoad(explicitPath)
  }

  for (const candidate of candidates) {
    try {
      await access(candidate)
    } catch {
      // Continue to Pi's regular theme directory if Codeline has no matching theme.
      continue
    }
    return themeFileLoad(candidate)
  }
  if (selection === "dark" || selection === "light") {
    return themeDocumentResolve(selection === "dark" ? dark : light, `builtin:${selection}`)
  }
  return createResultError(op, `Theme not found: ${selection}`)
}
