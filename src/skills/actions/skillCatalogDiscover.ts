import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { parseDocument } from "yaml"
import { projectDirectoryCanonicalPathResolve } from "../../project/projectDirectoryCanonicalPathResolve.js"
import type { SkillCatalog } from "../schema/skillCatalogSchema.js"
import { skillCatalogSchema as skillCatalogSchemaValue } from "../schema/skillCatalogSchema.js"
import type { SkillCollision } from "../schema/skillCollisionSchema.js"
import type { SkillDiagnostic } from "../schema/skillDiagnosticSchema.js"
import type { SkillFrontmatter } from "../schema/skillFrontmatterSchema.js"
import { skillFrontmatterSchema } from "../schema/skillFrontmatterSchema.js"
import type { SkillGroup } from "../schema/skillGroupSchema.js"
import type { SkillResource } from "../schema/skillResourceSchema.js"
import type { SkillSnapshot } from "../schema/skillSnapshotSchema.js"
import { skillDiscoveryLimits } from "../skillDiscoveryLimits.js"

type SkillSource = SkillDiagnostic["source"]
type SkillDiagnosticCode = SkillDiagnostic["code"]

export type SkillCatalogDiscoverOptions = {
  globalSkillsPath?: string
  globalSkillsRoot?: string
  homeDirectory?: string
  maxBundles?: number
  maxDiagnostics?: number
  maxDirectoryEntries?: number
  maxDirectories?: number
  maxFileBytes?: number
  maxResources?: number
  maxResourcesPerBundle?: number
  maxSnapshots?: number
  maxTotalBytes?: number
  projectRoot: string
  projectSkillsPath?: string
  projectSkillsRoot?: string
}

type SkillRootDescriptor = {
  path: string
  precedence: number
  source: SkillSource
}

type SkillRoot = SkillRootDescriptor & {
  canonicalPath: string
}

type SkillCandidateKind = "directory" | "file" | "other" | "symbolic-link" | "unavailable"

type SkillCandidate = {
  absolutePath: string
  bundlePath: string
  kind: SkillCandidateKind
  relativePath: string
  root: SkillRoot
}

type SkillDiscoveredEntry = {
  absolutePath: string
  kind: SkillCandidateKind
  relativePath: string
}

type SkillRootScan = {
  candidates: SkillCandidate[]
  entries: SkillDiscoveredEntry[]
  groups: SkillGroup[]
  root: SkillRoot
}

type SkillReadSuccess = {
  content: string
  digest: string
  size: number
}

type SkillReadFailure = {
  code: Exclude<
    SkillDiagnosticCode,
    "bundle-limit-exceeded" | "diagnostic-limit-exceeded" | "resource-limit-exceeded" | "snapshot-limit-exceeded"
  >
  message: string
}

type SkillReadResult = { status: "error"; failure: SkillReadFailure } | { data: SkillReadSuccess; status: "ok" }

type SkillReadState = {
  resourceCount: number
  seenCanonicalPaths: Set<string>
  totalBytes: number
}

type SkillLimits = {
  maxBundles: number
  maxDiagnostics: number
  maxDirectoryEntries: number
  maxDirectories: number
  maxFileBytes: number
  maxResources: number
  maxResourcesPerBundle: number
  maxTotalBytes: number
}

type SkillDiagnosticState = {
  diagnostics: SkillDiagnostic[]
  limitReached: boolean
  maxDiagnostics: number
}

type SkillFrontmatterParseResult =
  | { status: "invalid"; value?: Record<string, unknown> }
  | { status: "missing" }
  | { body: string; frontmatter: SkillFrontmatter; status: "ok" }

function skillPathSort(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function skillSourceSort(left: SkillSource, right: SkillSource): number {
  return left === right ? 0 : left === "global" ? -1 : 1
}

function skillPathIsWithin(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function skillRelativePathResolve(rootPath: string, targetPath: string): string {
  const relativePath = path.relative(rootPath, targetPath)
  return relativePath === "" ? "." : relativePath.split(path.sep).join("/")
}

function skillDiagnosticCreate(
  root: SkillRootDescriptor,
  code: SkillDiagnosticCode,
  message: string,
  absolutePath: string,
  relativePath: string,
  bundlePath?: string,
): SkillDiagnostic {
  return {
    ...(bundlePath === undefined ? {} : { bundlePath }),
    code,
    message,
    path: absolutePath,
    precedence: root.precedence,
    relativePath,
    source: root.source,
  }
}

function skillDiagnosticAdd(state: SkillDiagnosticState, diagnostic: SkillDiagnostic): void {
  if (state.diagnostics.length < state.maxDiagnostics) {
    state.diagnostics.push(diagnostic)
    return
  }
  state.limitReached = true
}

function skillDiagnosticSort(left: SkillDiagnostic, right: SkillDiagnostic): number {
  const sourceOrder = skillSourceSort(left.source, right.source)
  if (sourceOrder !== 0) return sourceOrder
  if (left.precedence !== right.precedence) return left.precedence - right.precedence
  const pathOrder = skillPathSort(left.relativePath, right.relativePath)
  if (pathOrder !== 0) return pathOrder
  const codeOrder = skillPathSort(left.code, right.code)
  if (codeOrder !== 0) return codeOrder
  return skillPathSort(left.message, right.message)
}

function skillLimitResolve(
  value: number | undefined,
  fallback: number,
  maximum: number,
  minimum: number,
): Result<number> {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum)
    return createResultError("skillCatalogDiscover", "The skill discovery limit is invalid.")
  return createResult(resolved)
}

function skillLimitsResolve(options: SkillCatalogDiscoverOptions): Result<SkillLimits> {
  const maxBundles = skillLimitResolve(
    options.maxBundles ?? options.maxSnapshots,
    skillDiscoveryLimits.maximumBundles,
    skillDiscoveryLimits.maximumBundles,
    0,
  )
  if (!maxBundles.success) return maxBundles
  const maxDiagnostics = skillLimitResolve(
    options.maxDiagnostics,
    skillDiscoveryLimits.maximumDiagnostics,
    skillDiscoveryLimits.maximumDiagnostics,
    0,
  )
  if (!maxDiagnostics.success) return maxDiagnostics
  const maxDirectoryEntries = skillLimitResolve(
    options.maxDirectoryEntries,
    skillDiscoveryLimits.maximumDirectoryEntries,
    skillDiscoveryLimits.maximumDirectoryEntries,
    1,
  )
  if (!maxDirectoryEntries.success) return maxDirectoryEntries
  const maxDirectories = skillLimitResolve(
    options.maxDirectories,
    skillDiscoveryLimits.maximumDirectories,
    skillDiscoveryLimits.maximumDirectories,
    1,
  )
  if (!maxDirectories.success) return maxDirectories
  const maxFileBytes = skillLimitResolve(
    options.maxFileBytes,
    skillDiscoveryLimits.maximumFileBytes,
    skillDiscoveryLimits.maximumFileBytes,
    0,
  )
  if (!maxFileBytes.success) return maxFileBytes
  const maxResources = skillLimitResolve(
    options.maxResources,
    skillDiscoveryLimits.maximumResources,
    skillDiscoveryLimits.maximumResources,
    0,
  )
  if (!maxResources.success) return maxResources
  const maxResourcesPerBundle = skillLimitResolve(
    options.maxResourcesPerBundle,
    skillDiscoveryLimits.maximumResourcesPerBundle,
    skillDiscoveryLimits.maximumResourcesPerBundle,
    0,
  )
  if (!maxResourcesPerBundle.success) return maxResourcesPerBundle
  const maxTotalBytes = skillLimitResolve(
    options.maxTotalBytes,
    skillDiscoveryLimits.maximumTotalBytes,
    skillDiscoveryLimits.maximumTotalBytes,
    0,
  )
  if (!maxTotalBytes.success) return maxTotalBytes

  return createResult({
    maxBundles: maxBundles.data,
    maxDiagnostics: maxDiagnostics.data,
    maxDirectoryEntries: maxDirectoryEntries.data,
    maxDirectories: maxDirectories.data,
    maxFileBytes: maxFileBytes.data,
    maxResources: maxResources.data,
    maxResourcesPerBundle: maxResourcesPerBundle.data,
    maxTotalBytes: maxTotalBytes.data,
  })
}

function skillPathOptionResolve(
  rawPath: string | undefined,
  defaultPath: string,
  projectRoot?: string,
): Result<string> {
  const selectedPath = rawPath ?? defaultPath
  if (typeof selectedPath !== "string" || selectedPath.includes("\0") || selectedPath.includes("\\"))
    return createResultError("skillCatalogDiscover", "The skill root path is invalid.")
  const absolutePath = path.isAbsolute(selectedPath)
    ? path.resolve(selectedPath)
    : path.resolve(projectRoot ?? process.cwd(), selectedPath)
  if (!path.isAbsolute(absolutePath))
    return createResultError("skillCatalogDiscover", "The skill root path is invalid.")
  return createResult(absolutePath)
}

async function skillRootResolve(
  descriptor: SkillRootDescriptor,
  diagnosticState: SkillDiagnosticState,
): Promise<SkillRoot | null> {
  let currentStat: Awaited<ReturnType<typeof fs.lstat>>
  try {
    currentStat = await fs.lstat(descriptor.path)
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === "ENOENT" || code === "ENOTDIR") return null
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        descriptor,
        "directory-unavailable",
        "The skill root directory could not be inspected.",
        descriptor.path,
        ".",
      ),
    )
    return null
  }

  if (currentStat.isSymbolicLink()) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        descriptor,
        "symbolic-link",
        "The skill root directory must not be a symbolic link.",
        descriptor.path,
        ".",
      ),
    )
    return null
  }
  if (!currentStat.isDirectory()) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        descriptor,
        "not-regular-file",
        "The skill root must be a directory.",
        descriptor.path,
        ".",
      ),
    )
    return null
  }

  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(descriptor.path)
  } catch (_error) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        descriptor,
        "directory-unavailable",
        "The skill root directory could not be canonicalized.",
        descriptor.path,
        ".",
      ),
    )
    return null
  }
  if (canonicalPath !== descriptor.path) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        descriptor,
        "symbolic-link",
        "The skill root directory must not contain a symbolic link.",
        descriptor.path,
        ".",
      ),
    )
    return null
  }
  return { ...descriptor, canonicalPath }
}

async function skillDirectoryEntriesRead(
  root: SkillRoot,
  directoryPath: string,
  relativePath: string,
  limits: SkillLimits,
  diagnosticState: SkillDiagnosticState,
): Promise<Dirent[]> {
  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(directoryPath)
  } catch (_error) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        root,
        "directory-unavailable",
        "The skill directory could not be canonicalized.",
        directoryPath,
        relativePath,
      ),
    )
    return []
  }
  if (canonicalPath !== directoryPath) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        root,
        "symbolic-link",
        "Skill directories must not be symbolic links.",
        directoryPath,
        relativePath,
      ),
    )
    return []
  }

  let entries: Dirent[]
  try {
    entries = await fs.readdir(directoryPath, { encoding: "utf8", withFileTypes: true })
  } catch (_error) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        root,
        "directory-unavailable",
        "The skill directory could not be read.",
        directoryPath,
        relativePath,
      ),
    )
    return []
  }

  entries.sort((left, right) => skillPathSort(left.name, right.name))
  if (entries.length <= limits.maxDirectoryEntries) return entries
  skillDiagnosticAdd(
    diagnosticState,
    skillDiagnosticCreate(
      root,
      "directory-entry-limit-exceeded",
      `The skill directory contains more than ${limits.maxDirectoryEntries} entries.`,
      directoryPath,
      relativePath,
    ),
  )
  return entries.slice(0, limits.maxDirectoryEntries)
}

async function skillRootScan(
  root: SkillRoot,
  limits: SkillLimits,
  diagnosticState: SkillDiagnosticState,
): Promise<SkillRootScan> {
  const scan: SkillRootScan = { candidates: [], entries: [], groups: [], root }
  const directories = [{ absolutePath: root.canonicalPath, relativePath: "." }]

  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index]
    if (directory === undefined) continue
    const entries = await skillDirectoryEntriesRead(
      root,
      directory.absolutePath,
      directory.relativePath,
      limits,
      diagnosticState,
    )

    for (const entry of entries) {
      const entryAbsolutePath = path.join(directory.absolutePath, entry.name)
      const entryRelativePath = directory.relativePath === "." ? entry.name : `${directory.relativePath}/${entry.name}`
      let entryStat: Awaited<ReturnType<typeof fs.lstat>>
      let kind: SkillCandidateKind
      try {
        entryStat = await fs.lstat(entryAbsolutePath)
        kind = entryStat.isSymbolicLink()
          ? "symbolic-link"
          : entryStat.isDirectory()
            ? "directory"
            : entryStat.isFile()
              ? "file"
              : "other"
      } catch (_error) {
        kind = "unavailable"
      }

      if (entry.name === "SKILL.md") {
        scan.candidates.push({
          absolutePath: entryAbsolutePath,
          bundlePath: directory.relativePath,
          kind,
          relativePath: entryRelativePath,
          root,
        })
      } else if (kind !== "directory") {
        scan.entries.push({ absolutePath: entryAbsolutePath, kind, relativePath: entryRelativePath })
      }

      if (kind !== "directory") continue
      if (scan.groups.length >= limits.maxDirectories) {
        skillDiagnosticAdd(
          diagnosticState,
          skillDiagnosticCreate(
            root,
            "directory-entry-limit-exceeded",
            `Skill discovery is limited to ${limits.maxDirectories} directories.`,
            entryAbsolutePath,
            entryRelativePath,
          ),
        )
        continue
      }
      scan.groups.push({ path: entryRelativePath, precedence: root.precedence, source: root.source })
      directories.push({ absolutePath: entryAbsolutePath, relativePath: entryRelativePath })
    }
  }

  return scan
}

async function skillTextRead(
  candidatePath: string,
  root: SkillRoot,
  limits: SkillLimits,
  readState: SkillReadState,
  isResource: boolean,
  containmentRoot: string = root.canonicalPath,
): Promise<SkillReadResult> {
  const label = isResource ? "Skill resource" : "SKILL.md"
  let candidateStat: Awaited<ReturnType<typeof fs.lstat>>
  try {
    candidateStat = await fs.lstat(candidatePath)
  } catch (_error) {
    return { failure: { code: "file-unavailable", message: `${label} could not be inspected.` }, status: "error" }
  }
  if (candidateStat.isSymbolicLink())
    return { failure: { code: "symbolic-link", message: `${label} must not be a symbolic link.` }, status: "error" }
  if (!candidateStat.isFile())
    return { failure: { code: "not-regular-file", message: `${label} must be a regular file.` }, status: "error" }

  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(candidatePath)
  } catch (_error) {
    return { failure: { code: "file-unavailable", message: `${label} could not be canonicalized.` }, status: "error" }
  }
  if (!skillPathIsWithin(root.canonicalPath, canonicalPath) || !skillPathIsWithin(containmentRoot, canonicalPath))
    return {
      failure: { code: "file-unavailable", message: `${label} is outside its allowed directory.` },
      status: "error",
    }

  if (!Number.isSafeInteger(candidateStat.size) || candidateStat.size > limits.maxFileBytes)
    return {
      failure: { code: "file-too-large", message: `${label} exceeds its file budget.` },
      status: "error",
    }
  if (readState.totalBytes + candidateStat.size > limits.maxTotalBytes)
    return {
      failure: { code: "total-byte-budget-exceeded", message: "The skill discovery byte budget would be exceeded." },
      status: "error",
    }

  let handle: fs.FileHandle | undefined
  try {
    try {
      handle = await fs.open(candidatePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    } catch (error: unknown) {
      const code = (error as { code?: string }).code
      return {
        failure: {
          code: code === "ELOOP" || code === "EMLINK" ? "symbolic-link" : "file-unavailable",
          message:
            code === "ELOOP" || code === "EMLINK"
              ? `${label} must not be a symbolic link.`
              : `${label} could not be read.`,
        },
        status: "error",
      }
    }
    const fileStat = await handle.stat()
    if (!fileStat.isFile())
      return { failure: { code: "not-regular-file", message: `${label} must be a regular file.` }, status: "error" }
    if (!Number.isSafeInteger(fileStat.size) || fileStat.size > limits.maxFileBytes)
      return { failure: { code: "file-too-large", message: `${label} exceeds its file budget.` }, status: "error" }
    if (readState.totalBytes + fileStat.size > limits.maxTotalBytes)
      return {
        failure: { code: "total-byte-budget-exceeded", message: "The skill discovery byte budget would be exceeded." },
        status: "error",
      }

    const contentBytes = await handle.readFile()
    if (contentBytes.byteLength > limits.maxFileBytes)
      return { failure: { code: "file-too-large", message: `${label} exceeds its file budget.` }, status: "error" }
    if (readState.totalBytes + contentBytes.byteLength > limits.maxTotalBytes)
      return {
        failure: { code: "total-byte-budget-exceeded", message: "The skill discovery byte budget would be exceeded." },
        status: "error",
      }
    if (contentBytes.includes(0))
      return { failure: { code: "binary-content", message: `${label} contains binary content.` }, status: "error" }

    let content: string
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(contentBytes)
    } catch (_error) {
      return { failure: { code: "invalid-utf8", message: `${label} is not valid UTF-8.` }, status: "error" }
    }
    readState.totalBytes += contentBytes.byteLength
    return {
      data: {
        content,
        digest: `sha256-${createHash("sha256").update(contentBytes).digest("hex")}`,
        size: contentBytes.byteLength,
      },
      status: "ok",
    }
  } catch (_error) {
    return { failure: { code: "file-unavailable", message: `${label} could not be read.` }, status: "error" }
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

function skillFrontmatterParseWithYaml(source: string): SkillFrontmatterParseResult {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  if (lines[0] !== "---") return { status: "missing" }
  const closingIndex = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."))
  if (closingIndex < 0) return { status: "invalid" }

  let data: unknown
  try {
    const parsed = skillYamlDocumentParse(lines.slice(1, closingIndex).join("\n"))
    data = parsed
  } catch (_error) {
    return { status: "invalid" }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { status: "invalid" }
  const record = data as Record<string, unknown>
  const parsed = v.safeParse(skillFrontmatterSchema, record)
  if (!parsed.success) return { status: "invalid", value: record }
  return {
    body: lines
      .slice(closingIndex + 1)
      .join("\n")
      .trim(),
    frontmatter: parsed.output,
    status: "ok",
  }
}

function skillYamlDocumentParse(source: string): unknown {
  const document = parseDocument(source, { uniqueKeys: true })
  if (document.errors.length > 0) throw new Error("The skill frontmatter YAML is invalid.")
  return document.toJS({ mapAsMap: false })
}

function skillBundleDigestCreate(
  frontmatter: SkillFrontmatter,
  contentDigest: string,
  resources: readonly SkillResource[],
): string {
  const stable = JSON.stringify({
    description: frontmatter.description,
    name: frontmatter.name,
    resources: resources.map(({ digest, path: resourcePath, size }) => ({ digest, path: resourcePath, size })),
    skillDigest: contentDigest,
  })
  return `sha256-${createHash("sha256").update(stable, "utf8").digest("hex")}`
}

function skillCollisionCandidateCreate(snapshot: SkillSnapshot): SkillCollision["candidates"][number] {
  return {
    bundlePath: snapshot.bundlePath,
    canonicalPath: snapshot.canonicalPath,
    digest: snapshot.digest,
    precedence: snapshot.precedence,
    source: snapshot.source,
  }
}

function skillBundleWinnerSort(left: SkillSnapshot, right: SkillSnapshot): number {
  const sourceOrder = skillSourceSort(right.source, left.source)
  if (sourceOrder !== 0) return sourceOrder
  const bundleOrder = skillPathSort(left.bundlePath, right.bundlePath)
  if (bundleOrder !== 0) return bundleOrder
  return skillPathSort(left.canonicalPath, right.canonicalPath)
}

function skillSnapshotSort(left: SkillSnapshot, right: SkillSnapshot): number {
  const sourceOrder = skillSourceSort(left.source, right.source)
  if (sourceOrder !== 0) return sourceOrder
  const pathOrder = skillPathSort(left.bundlePath, right.bundlePath)
  if (pathOrder !== 0) return pathOrder
  const nameOrder = skillPathSort(left.name, right.name)
  if (nameOrder !== 0) return nameOrder
  return skillPathSort(left.canonicalPath, right.canonicalPath)
}

function skillCatalogDigestCreate(
  roots: readonly SkillCatalog["roots"][number][],
  groups: readonly SkillGroup[],
  bundles: readonly SkillSnapshot[],
  collisions: readonly SkillCollision[],
  diagnostics: readonly SkillDiagnostic[],
): string {
  const collisionData = collisions.map(({ candidates, name, winner }) => ({
    candidates: candidates.map(({ bundlePath, digest, precedence, source }) => ({
      bundlePath,
      digest,
      precedence,
      source,
    })),
    name,
    winner: {
      bundlePath: winner.bundlePath,
      digest: winner.digest,
      precedence: winner.precedence,
      source: winner.source,
    },
  }))
  const stable = JSON.stringify({
    bundles: bundles.map(({ bundleDigest, bundlePath, description, digest, name, precedence, resources, source }) => ({
      bundleDigest,
      bundlePath,
      description,
      digest,
      name,
      precedence,
      resources: resources.map(({ digest: resourceDigest, path: resourcePath, size }) => ({
        digest: resourceDigest,
        path: resourcePath,
        size,
      })),
      source,
    })),
    collisions: collisionData,
    diagnostics: diagnostics.map(({ bundlePath, code, relativePath, source }) => ({
      bundlePath,
      code,
      relativePath,
      source,
    })),
    groups,
    roots: roots.map(({ source, precedence }) => ({ precedence, source })),
    version: 1,
  })
  return `sha256-${createHash("sha256").update(stable, "utf8").digest("hex")}`
}

function skillRootDescriptorSort(left: SkillRootDescriptor, right: SkillRootDescriptor): number {
  const sourceOrder = skillSourceSort(left.source, right.source)
  if (sourceOrder !== 0) return sourceOrder
  return skillPathSort(left.path, right.path)
}

function skillSnapshotDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) skillSnapshotDeepFreeze(child)
  return value
}

async function skillSnapshotRead(
  candidate: SkillCandidate,
  limits: SkillLimits,
  readState: SkillReadState,
  bundleDirectories: readonly string[],
  diagnosticState: SkillDiagnosticState,
  rootEntries: readonly SkillDiscoveredEntry[],
  bundleCount: number,
): Promise<SkillSnapshot | null> {
  if (candidate.kind === "symbolic-link") {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        candidate.root,
        "symbolic-link",
        "SKILL.md must not be a symbolic link.",
        candidate.absolutePath,
        candidate.relativePath,
        candidate.bundlePath,
      ),
    )
    return null
  }
  if (candidate.kind !== "file") {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        candidate.root,
        candidate.kind === "unavailable" ? "file-unavailable" : "not-regular-file",
        candidate.kind === "unavailable" ? "SKILL.md could not be inspected." : "SKILL.md must be a regular file.",
        candidate.absolutePath,
        candidate.relativePath,
        candidate.bundlePath,
      ),
    )
    return null
  }

  if (bundleCount >= limits.maxBundles) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        candidate.root,
        "snapshot-limit-exceeded",
        `Skill snapshots are limited to ${limits.maxBundles} bundles.`,
        candidate.absolutePath,
        candidate.relativePath,
        candidate.bundlePath,
      ),
    )
    return null
  }

  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(candidate.absolutePath)
  } catch (_error) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        candidate.root,
        "file-unavailable",
        "SKILL.md could not be canonicalized.",
        candidate.absolutePath,
        candidate.relativePath,
        candidate.bundlePath,
      ),
    )
    return null
  }
  if (!skillPathIsWithin(candidate.root.canonicalPath, canonicalPath)) {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        candidate.root,
        "file-unavailable",
        "SKILL.md is outside the skill root.",
        candidate.absolutePath,
        candidate.relativePath,
        candidate.bundlePath,
      ),
    )
    return null
  }
  if (readState.seenCanonicalPaths.has(canonicalPath)) return null
  readState.seenCanonicalPaths.add(canonicalPath)

  const read = await skillTextRead(candidate.absolutePath, candidate.root, limits, readState, false)
  if (read.status === "error") {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        candidate.root,
        read.failure.code,
        read.failure.message,
        canonicalPath,
        candidate.relativePath,
        candidate.bundlePath,
      ),
    )
    return null
  }
  const parsed = skillFrontmatterParseWithYaml(read.data.content)
  if (parsed.status === "missing") {
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        candidate.root,
        "frontmatter-missing",
        "SKILL.md requires YAML frontmatter.",
        canonicalPath,
        candidate.relativePath,
        candidate.bundlePath,
      ),
    )
    return null
  }
  if (parsed.status !== "ok") {
    const candidateName = parsed.value?.name
    const invalidName =
      candidateName === undefined ||
      typeof candidateName !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidateName.trim())
    skillDiagnosticAdd(
      diagnosticState,
      skillDiagnosticCreate(
        candidate.root,
        invalidName ? "invalid-name" : "invalid-frontmatter",
        invalidName ? "SKILL.md has an invalid frontmatter name." : "SKILL.md frontmatter is invalid.",
        canonicalPath,
        candidate.relativePath,
        candidate.bundlePath,
      ),
    )
    return null
  }

  const bundleDirectory = path.dirname(canonicalPath)
  const resources: SkillResource[] = []
  const resourceEntries = rootEntries
    .filter((entry) => skillPathIsWithin(bundleDirectory, entry.absolutePath))
    .filter(
      (entry) =>
        !bundleDirectories.some(
          (candidateDirectory) =>
            candidateDirectory !== bundleDirectory &&
            skillPathIsWithin(bundleDirectory, candidateDirectory) &&
            skillPathIsWithin(candidateDirectory, entry.absolutePath),
        ),
    )
    .map((entry) => ({
      ...entry,
      resourcePath: skillRelativePathResolve(bundleDirectory, entry.absolutePath),
    }))
    .filter(({ resourcePath }) => resourcePath !== "." && path.basename(resourcePath) !== "SKILL.md")
    .sort((left, right) => skillPathSort(left.resourcePath, right.resourcePath))

  for (const entry of resourceEntries) {
    if (resources.length >= limits.maxResourcesPerBundle || readState.resourceCount >= limits.maxResources) {
      skillDiagnosticAdd(
        diagnosticState,
        skillDiagnosticCreate(
          candidate.root,
          "resource-limit-exceeded",
          "Skill resource discovery exceeded its resource budget.",
          entry.absolutePath,
          entry.relativePath,
          candidate.bundlePath,
        ),
      )
      break
    }
    const resourceRead = await skillTextRead(
      entry.absolutePath,
      candidate.root,
      limits,
      readState,
      true,
      bundleDirectory,
    )
    if (resourceRead.status === "error") {
      skillDiagnosticAdd(
        diagnosticState,
        skillDiagnosticCreate(
          candidate.root,
          resourceRead.failure.code,
          resourceRead.failure.message,
          entry.absolutePath,
          entry.relativePath,
          candidate.bundlePath,
        ),
      )
      continue
    }
    const canonicalResourcePath = await fs.realpath(entry.absolutePath).catch(() => null)
    if (canonicalResourcePath === null || !skillPathIsWithin(bundleDirectory, canonicalResourcePath)) {
      skillDiagnosticAdd(
        diagnosticState,
        skillDiagnosticCreate(
          candidate.root,
          "file-unavailable",
          "Skill resources must remain inside their bundle directory.",
          entry.absolutePath,
          entry.relativePath,
          candidate.bundlePath,
        ),
      )
      continue
    }
    resources.push({
      canonicalPath: canonicalResourcePath,
      content: resourceRead.data.content,
      digest: resourceRead.data.digest,
      path: entry.resourcePath,
      size: resourceRead.data.size,
    })
    readState.resourceCount += 1
  }

  resources.sort((left, right) => skillPathSort(left.path, right.path))
  const bundleDigest = skillBundleDigestCreate(parsed.frontmatter, read.data.digest, resources)
  return {
    body: parsed.body,
    bundleDigest,
    bundlePath: candidate.bundlePath,
    canonicalPath,
    content: read.data.content,
    description: parsed.frontmatter.description,
    digest: read.data.digest,
    name: parsed.frontmatter.name,
    precedence: candidate.root.precedence,
    resources,
    size: read.data.size,
    source: candidate.root.source,
  }
}

function skillCollisionsResolve(bundles: readonly SkillSnapshot[]): {
  bundles: SkillSnapshot[]
  collisions: SkillCollision[]
  skills: SkillSnapshot[]
} {
  const collisions: SkillCollision[] = []
  const selectedBundles: SkillSnapshot[] = []
  const resolvedBundles = bundles.map((bundle) => ({ ...bundle }))
  const resolvedByName = new Map<string, SkillSnapshot[]>()
  for (const bundle of resolvedBundles) {
    const current = resolvedByName.get(bundle.name) ?? []
    current.push(bundle)
    resolvedByName.set(bundle.name, current)
  }
  for (const [name, candidates] of resolvedByName) {
    const ordered = [...candidates].sort(skillBundleWinnerSort)
    const winner = ordered[0]
    if (winner === undefined) continue
    selectedBundles.push(winner)
    if (ordered.length > 1) {
      collisions.push({
        candidates: ordered.map(skillCollisionCandidateCreate),
        name,
        winner: skillCollisionCandidateCreate(winner),
      })
    }
  }
  resolvedBundles.sort(skillSnapshotSort)
  selectedBundles.sort((left, right) => skillPathSort(left.name, right.name))
  collisions.sort((left, right) => skillPathSort(left.name, right.name))
  return { bundles: resolvedBundles, collisions, skills: selectedBundles }
}

export async function skillCatalogDiscover(options: SkillCatalogDiscoverOptions): Promise<Result<SkillCatalog>> {
  const op = "skillCatalogDiscover"
  const projectRoot = await projectDirectoryCanonicalPathResolve(options.projectRoot)
  if (!projectRoot.success) return createResultError(op, "The project root is invalid.")
  const limits = skillLimitsResolve(options)
  if (!limits.success) return limits

  const globalSkillsPath = skillPathOptionResolve(
    options.globalSkillsRoot ?? options.globalSkillsPath,
    path.join(options.homeDirectory ?? os.homedir(), ".agents", "skills"),
    options.homeDirectory ?? os.homedir(),
  )
  if (!globalSkillsPath.success) return globalSkillsPath
  const projectSkillsPath = skillPathOptionResolve(
    options.projectSkillsRoot ?? options.projectSkillsPath,
    path.join(projectRoot.data, ".agents", "skills"),
    projectRoot.data,
  )
  if (!projectSkillsPath.success) return projectSkillsPath
  if (!skillPathIsWithin(projectRoot.data, projectSkillsPath.data))
    return createResultError(op, "The project skill root must be inside the project root.")

  const diagnosticState: SkillDiagnosticState = {
    diagnostics: [],
    limitReached: false,
    maxDiagnostics: limits.data.maxDiagnostics,
  }
  const descriptors: SkillRootDescriptor[] = [
    { path: globalSkillsPath.data, precedence: 0, source: "global" },
    { path: projectSkillsPath.data, precedence: 1, source: "project" },
  ]
  descriptors.sort(skillRootDescriptorSort)
  const roots: SkillCatalog["roots"] = descriptors.map(({ path: rootPath, precedence, source }) => ({
    canonicalPath: rootPath,
    precedence,
    source,
  }))

  const scans: SkillRootScan[] = []
  for (const descriptor of descriptors) {
    const root = await skillRootResolve(descriptor, diagnosticState)
    if (root === null) continue
    roots.find((entry) => entry.source === root.source)!.canonicalPath = root.canonicalPath
    scans.push(await skillRootScan(root, limits.data, diagnosticState))
  }

  const candidates = scans
    .flatMap((scan) => scan.candidates)
    .sort((left, right) => {
      const sourceOrder = skillSourceSort(right.root.source, left.root.source)
      if (sourceOrder !== 0) return sourceOrder
      const pathOrder = skillPathSort(left.relativePath, right.relativePath)
      if (pathOrder !== 0) return pathOrder
      return skillPathSort(left.absolutePath, right.absolutePath)
    })
  const bundles: SkillSnapshot[] = []
  const readState: SkillReadState = { resourceCount: 0, seenCanonicalPaths: new Set(), totalBytes: 0 }
  for (const candidate of candidates) {
    const scan = scans.find(({ root }) => root.source === candidate.root.source)
    if (scan === undefined) continue
    const snapshot = await skillSnapshotRead(
      candidate,
      limits.data,
      readState,
      scan.candidates.map(({ absolutePath }) => path.dirname(absolutePath)),
      diagnosticState,
      scan.entries,
      bundles.length,
    )
    if (snapshot !== null) bundles.push(snapshot)
  }

  const resolved = skillCollisionsResolve(bundles)
  const groups = scans
    .flatMap((scan) => scan.groups)
    .sort((left, right) => {
      const sourceOrder = skillSourceSort(left.source, right.source)
      if (sourceOrder !== 0) return sourceOrder
      return skillPathSort(left.path, right.path)
    })
  const diagnostics = [...diagnosticState.diagnostics]
  diagnostics.sort(skillDiagnosticSort)
  if (diagnosticState.limitReached && limits.data.maxDiagnostics > 0) {
    diagnostics.splice(
      limits.data.maxDiagnostics - 1,
      1,
      skillDiagnosticCreate(
        { path: projectRoot.data, precedence: 1, source: "project" },
        "diagnostic-limit-exceeded",
        `Skill diagnostics are limited to ${limits.data.maxDiagnostics} entries.`,
        projectRoot.data,
        ".",
      ),
    )
    diagnostics.sort(skillDiagnosticSort)
  }

  const digest = skillCatalogDigestCreate(roots, groups, resolved.bundles, resolved.collisions, diagnostics)
  const catalog = {
    bundles: resolved.bundles,
    collisions: resolved.collisions,
    diagnostics,
    digest,
    groups,
    roots,
    skills: resolved.skills,
    version: 1 as const,
  }
  const parsed = v.safeParse(skillCatalogSchemaValue, catalog)
  if (!parsed.success) return createResultError(op, "The discovered skill catalog is invalid.")
  return createResult(skillSnapshotDeepFreeze(structuredClone(parsed.output)))
}
