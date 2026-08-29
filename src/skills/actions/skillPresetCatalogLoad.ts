import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { parseDocument } from "yaml"
import { projectDirectoryCanonicalPathResolve } from "../../project/projectDirectoryCanonicalPathResolve.js"
import type { SkillPresetCatalog } from "../schema/skillPresetCatalogSchema.js"
import { skillPresetCatalogSchema } from "../schema/skillPresetCatalogSchema.js"
import type { SkillPresetDiagnostic } from "../schema/skillPresetDiagnosticSchema.js"
import type { SkillPreset } from "../schema/skillPresetSchema.js"
import { skillPresetSchema } from "../schema/skillPresetSchema.js"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"
import { skillPresetAll } from "../skillPresetAll.js"

const skillPresetDirectoryRelativePath = ".agents/skill-presets"

type SkillPresetDiagnosticCode = SkillPresetDiagnostic["code"]

type SkillPresetCatalogLoadLimits = {
  maxDiagnostics: number
  maxFileBytes: number
  maxPresets: number
}

type SkillPresetFileReadResult =
  | { code: Exclude<SkillPresetDiagnosticCode, "preset-limit-exceeded">; message: string; status: "error" }
  | { content: string; status: "ok" }

export type SkillPresetCatalogLoadOptions = {
  maxDiagnostics?: number
  maxFileBytes?: number
  maxPresets?: number
  projectRoot: string
}

function skillPresetPathSort(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function skillPresetLimitResolve(
  value: number | undefined,
  fallback: number,
  maximum: number,
  minimum: number,
): Result<number> {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum)
    return createResultError("skillPresetCatalogLoad", "The skill preset loading limit is invalid.")
  return createResult(resolved)
}

function skillPresetCatalogLoadLimitsResolve(
  options: SkillPresetCatalogLoadOptions,
): Result<SkillPresetCatalogLoadLimits> {
  const maxDiagnostics = skillPresetLimitResolve(
    options.maxDiagnostics,
    skillDiscoveryLimits.maximumDiagnostics,
    skillDiscoveryLimits.maximumDiagnostics,
    0,
  )
  if (!maxDiagnostics.success) return maxDiagnostics
  const maxFileBytes = skillPresetLimitResolve(
    options.maxFileBytes,
    skillDiscoveryLimits.maximumFileBytes,
    skillDiscoveryLimits.maximumFileBytes,
    0,
  )
  if (!maxFileBytes.success) return maxFileBytes
  const maxPresets = skillPresetLimitResolve(
    options.maxPresets,
    skillDiscoveryLimits.maximumBundles,
    skillDiscoveryLimits.maximumBundles,
    0,
  )
  if (!maxPresets.success) return maxPresets
  return createResult({
    maxDiagnostics: maxDiagnostics.data,
    maxFileBytes: maxFileBytes.data,
    maxPresets: maxPresets.data,
  })
}

function skillPresetPathIsWithin(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function skillPresetDiagnosticCreate(
  code: SkillPresetDiagnosticCode,
  message: string,
  presetDirectory: string,
  relativePath: string,
): SkillPresetDiagnostic {
  return {
    code,
    message,
    path:
      relativePath === skillPresetDirectoryRelativePath
        ? presetDirectory
        : path.join(presetDirectory, path.basename(relativePath)),
    relativePath,
  }
}

function skillPresetDiagnosticSort(left: SkillPresetDiagnostic, right: SkillPresetDiagnostic): number {
  const pathOrder = skillPresetPathSort(left.relativePath, right.relativePath)
  if (pathOrder !== 0) return pathOrder
  const codeOrder = skillPresetPathSort(left.code, right.code)
  if (codeOrder !== 0) return codeOrder
  return skillPresetPathSort(left.message, right.message)
}

function skillPresetDiagnosticAdd(
  diagnostics: SkillPresetDiagnostic[],
  diagnostic: SkillPresetDiagnostic,
  maxDiagnostics: number,
): boolean {
  if (diagnostics.length < maxDiagnostics) {
    diagnostics.push(diagnostic)
    return false
  }
  return true
}

function skillPresetCatalogDigestCreate(
  presets: readonly SkillPreset[],
  diagnostics: readonly SkillPresetDiagnostic[],
): string {
  const stable = JSON.stringify({
    diagnostics: diagnostics.map(({ code, message, relativePath }) => ({ code, message, relativePath })),
    presets,
    version: 1,
  })
  return `sha256-${createHash("sha256").update(stable, "utf8").digest("hex")}`
}

function skillPresetCatalogDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) skillPresetCatalogDeepFreeze(child)
  return value
}

async function skillPresetFileRead(
  filePath: string,
  presetDirectory: string,
  maxFileBytes: number,
): Promise<SkillPresetFileReadResult> {
  let fileStat: Awaited<ReturnType<typeof fsPromises.lstat>>
  try {
    fileStat = await fsPromises.lstat(filePath)
  } catch (_error) {
    return { code: "file-unavailable", message: "The skill preset file could not be inspected.", status: "error" }
  }
  if (fileStat.isSymbolicLink())
    return { code: "symbolic-link", message: "Skill preset files must not be symbolic links.", status: "error" }
  if (!fileStat.isFile())
    return { code: "not-regular-file", message: "The skill preset entry must be a regular file.", status: "error" }

  let canonicalPath: string
  try {
    canonicalPath = await fsPromises.realpath(filePath)
  } catch (_error) {
    return { code: "file-unavailable", message: "The skill preset file could not be canonicalized.", status: "error" }
  }
  if (canonicalPath !== filePath || !skillPresetPathIsWithin(presetDirectory, canonicalPath))
    return {
      code: "symbolic-link",
      message: "Skill preset files must remain in the preset directory.",
      status: "error",
    }
  if (!Number.isSafeInteger(fileStat.size) || fileStat.size > maxFileBytes)
    return { code: "file-too-large", message: "The skill preset file exceeds its file budget.", status: "error" }

  let handle: fsPromises.FileHandle | undefined
  try {
    try {
      handle = await fsPromises.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    } catch (error: unknown) {
      const code = (error as { code?: string }).code
      return {
        code: code === "ELOOP" || code === "EMLINK" ? "symbolic-link" : "file-unavailable",
        message:
          code === "ELOOP" || code === "EMLINK"
            ? "Skill preset files must not be symbolic links."
            : "The skill preset file could not be read.",
        status: "error",
      }
    }
    const openedStat = await handle.stat()
    if (!openedStat.isFile())
      return { code: "not-regular-file", message: "The skill preset entry must be a regular file.", status: "error" }
    if (!Number.isSafeInteger(openedStat.size) || openedStat.size > maxFileBytes)
      return { code: "file-too-large", message: "The skill preset file exceeds its file budget.", status: "error" }
    const contentBytes = await handle.readFile()
    if (contentBytes.byteLength > maxFileBytes)
      return { code: "file-too-large", message: "The skill preset file exceeds its file budget.", status: "error" }
    if (contentBytes.includes(0))
      return { code: "binary-content", message: "The skill preset file contains binary content.", status: "error" }
    try {
      return { content: new TextDecoder("utf-8", { fatal: true }).decode(contentBytes), status: "ok" }
    } catch (_error) {
      return { code: "invalid-utf8", message: "The skill preset file is not valid UTF-8.", status: "error" }
    }
  } catch (_error) {
    return { code: "file-unavailable", message: "The skill preset file could not be read.", status: "error" }
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close()
      } catch (_error) {
        // The content has already been copied or the read has already failed.
      }
    }
  }
}

function skillPresetYamlParse(source: string): Result<unknown> {
  const op = "skillPresetCatalogLoad"
  try {
    const document = parseDocument(source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"), { uniqueKeys: true })
    if (document.errors.length > 0) return createResultError(op, "The skill preset YAML is invalid.")
    return createResult(document.toJS({ mapAsMap: false }))
  } catch (_error) {
    return createResultError(op, "The skill preset YAML is invalid.")
  }
}

function skillPresetCatalogEmptyCreate(): SkillPresetCatalog {
  const diagnostics: SkillPresetDiagnostic[] = []
  const presets = [structuredClone(skillPresetAll)]
  const catalog = {
    diagnostics,
    digest: skillPresetCatalogDigestCreate(presets, diagnostics),
    presets,
    version: 1 as const,
  }
  return skillPresetCatalogDeepFreeze(structuredClone(catalog))
}

export async function skillPresetCatalogLoad(
  options: SkillPresetCatalogLoadOptions,
): Promise<Result<SkillPresetCatalog>> {
  const op = "skillPresetCatalogLoad"
  const projectRoot = await projectDirectoryCanonicalPathResolve(options.projectRoot)
  if (!projectRoot.success) return createResultError(op, "The project root is invalid.")
  const limits = skillPresetCatalogLoadLimitsResolve(options)
  if (!limits.success) return limits

  const presetDirectory = path.join(projectRoot.data, ".agents", "skill-presets")
  let directoryStat: Awaited<ReturnType<typeof fsPromises.lstat>>
  try {
    directoryStat = await fsPromises.lstat(presetDirectory)
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === "ENOENT" || code === "ENOTDIR") return createResult(skillPresetCatalogEmptyCreate())
    return createResultError(op, "The skill preset directory could not be inspected.")
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory())
    return createResultError(op, "The skill preset path is not a real directory.")

  let canonicalPresetDirectory: string
  try {
    canonicalPresetDirectory = await fsPromises.realpath(presetDirectory)
  } catch (_error) {
    return createResultError(op, "The skill preset directory could not be canonicalized.")
  }
  if (canonicalPresetDirectory !== presetDirectory)
    return createResultError(op, "The skill preset directory must not be a symbolic link.")

  let directoryEntries: Dirent<string>[]
  try {
    directoryEntries = await fsPromises.readdir(presetDirectory, { encoding: "utf8", withFileTypes: true })
  } catch (_error) {
    return createResultError(op, "The skill preset directory could not be read.")
  }

  const presetFiles = directoryEntries
    .filter((entry) => entry.name.endsWith(".yaml"))
    .map((entry) => entry.name)
    .sort(skillPresetPathSort)
  const diagnostics: SkillPresetDiagnostic[] = []
  let diagnosticLimitReached = false
  if (presetFiles.length > limits.data.maxPresets) {
    diagnosticLimitReached = skillPresetDiagnosticAdd(
      diagnostics,
      skillPresetDiagnosticCreate(
        "preset-limit-exceeded",
        `Skill presets are limited to ${limits.data.maxPresets} entries.`,
        presetDirectory,
        skillPresetDirectoryRelativePath,
      ),
      limits.data.maxDiagnostics,
    )
  }

  const presets: SkillPreset[] = [structuredClone(skillPresetAll)]
  const filesToRead = presetFiles.slice(0, limits.data.maxPresets)
  for (const fileName of filesToRead) {
    const relativePath = `${skillPresetDirectoryRelativePath}/${fileName}`
    const filePath = path.join(presetDirectory, fileName)
    const file = await skillPresetFileRead(filePath, canonicalPresetDirectory, limits.data.maxFileBytes)
    if (file.status === "error") {
      diagnosticLimitReached =
        skillPresetDiagnosticAdd(
          diagnostics,
          skillPresetDiagnosticCreate(file.code, file.message, presetDirectory, relativePath),
          limits.data.maxDiagnostics,
        ) || diagnosticLimitReached
      continue
    }

    const parsedYaml = skillPresetYamlParse(file.content)
    if (!parsedYaml.success) {
      diagnosticLimitReached =
        skillPresetDiagnosticAdd(
          diagnostics,
          skillPresetDiagnosticCreate("invalid-yaml", parsedYaml.errorMessage, presetDirectory, relativePath),
          limits.data.maxDiagnostics,
        ) || diagnosticLimitReached
      continue
    }
    const parsedPreset = v.safeParse(skillPresetSchema, parsedYaml.data)
    const hasUserImmutable =
      typeof parsedYaml.data === "object" && parsedYaml.data !== null && Object.hasOwn(parsedYaml.data, "immutable")
    if (!parsedPreset.success || hasUserImmutable) {
      diagnosticLimitReached =
        skillPresetDiagnosticAdd(
          diagnostics,
          skillPresetDiagnosticCreate(
            "invalid-preset",
            "The skill preset metadata is invalid.",
            presetDirectory,
            relativePath,
          ),
          limits.data.maxDiagnostics,
        ) || diagnosticLimitReached
      continue
    }
    const expectedName = fileName.slice(0, -".yaml".length)
    if (parsedPreset.output.name !== expectedName) {
      diagnosticLimitReached =
        skillPresetDiagnosticAdd(
          diagnostics,
          skillPresetDiagnosticCreate(
            "name-mismatch",
            "The skill preset name must match its filename.",
            presetDirectory,
            relativePath,
          ),
          limits.data.maxDiagnostics,
        ) || diagnosticLimitReached
      continue
    }
    if (parsedPreset.output.name === skillPresetAll.name) {
      diagnosticLimitReached =
        skillPresetDiagnosticAdd(
          diagnostics,
          skillPresetDiagnosticCreate(
            "reserved-name",
            "The built-in All skill preset cannot be redefined.",
            presetDirectory,
            relativePath,
          ),
          limits.data.maxDiagnostics,
        ) || diagnosticLimitReached
      continue
    }
    presets.push(parsedPreset.output)
  }

  presets.sort((left, right) => skillPresetPathSort(left.name, right.name))
  diagnostics.sort(skillPresetDiagnosticSort)
  if (diagnosticLimitReached && limits.data.maxDiagnostics > 0) {
    diagnostics.splice(
      limits.data.maxDiagnostics - 1,
      1,
      skillPresetDiagnosticCreate(
        "diagnostic-limit-exceeded",
        `Skill preset diagnostics are limited to ${limits.data.maxDiagnostics} entries.`,
        presetDirectory,
        skillPresetDirectoryRelativePath,
      ),
    )
    diagnostics.sort(skillPresetDiagnosticSort)
  }

  const catalog = {
    diagnostics,
    digest: skillPresetCatalogDigestCreate(presets, diagnostics),
    presets,
    version: 1 as const,
  }
  const validated = v.safeParse(skillPresetCatalogSchema, catalog)
  if (!validated.success) return createResultError(op, "The skill preset catalog is invalid.")
  return createResult(skillPresetCatalogDeepFreeze(structuredClone(validated.output)))
}
