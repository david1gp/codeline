import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { parseDocument } from "yaml"
import { projectDirectoryCanonicalPathResolve } from "../../project/projectDirectoryCanonicalPathResolve.js"
import { commandDiscoveryLimits } from "../commandDiscoveryLimits.js"
import { type CommandCatalog, commandCatalogSchema } from "../schema/commandCatalogSchema.js"
import type { CommandCollision } from "../schema/commandCollisionSchema.js"
import type { CommandDiagnostic } from "../schema/commandDiagnosticSchema.js"
import { type CommandFrontmatter, commandFrontmatterSchema } from "../schema/commandFrontmatterSchema.js"
import type { CommandSnapshot } from "../schema/commandSnapshotSchema.js"

type CommandSource = CommandDiagnostic["source"]
type CommandDiagnosticCode = CommandDiagnostic["code"]

export type CommandCatalogDiscoverOptions = {
  globalCommandsPath?: string
  globalCommandsRoot?: string
  homeDirectory?: string
  maxCommands?: number
  maxDiagnostics?: number
  maxDirectoryEntries?: number
  maxDirectories?: number
  maxFileBytes?: number
  maxTotalBytes?: number
  projectCommandsPath?: string
  projectCommandsRoot?: string
  projectRoot: string
}

type CommandRoot = {
  canonicalPath: string
  path: string
  precedence: number
  source: CommandSource
}

type CommandCandidate = {
  absolutePath: string
  kind: "directory" | "file" | "other" | "symbolic-link" | "unavailable"
  name: string
  relativePath: string
  root: CommandRoot
}

type CommandRootScan = {
  candidates: CommandCandidate[]
  root: CommandRoot
}

type CommandReadState = {
  seenCanonicalPaths: Set<string>
  totalBytes: number
}

type CommandLimits = {
  maxCommands: number
  maxDiagnostics: number
  maxDirectoryEntries: number
  maxDirectories: number
  maxFileBytes: number
  maxTotalBytes: number
}

type CommandDiagnosticState = {
  diagnostics: CommandDiagnostic[]
  limitReached: boolean
  maxDiagnostics: number
}

type CommandFrontmatterParseResult =
  | { body: string; frontmatter: CommandFrontmatter; status: "ok" }
  | { status: "invalid"; value?: Record<string, unknown> }
  | { status: "missing" }

function commandPathSort(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function commandSourceSort(left: CommandSource, right: CommandSource): number {
  return left === right ? 0 : left === "global" ? -1 : 1
}

function commandPathIsWithin(rootPath: string, targetPath: string): boolean {
  const relativePath = path.relative(rootPath, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function commandNameFromRelativePath(relativePath: string): string | undefined {
  if (!relativePath.endsWith(".md")) return undefined
  const name = relativePath.slice(0, -3)
  const parsed = v.safeParse(
    v.pipe(v.string(), v.regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?(?:\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9_-])?)*$/)),
    name,
  )
  return parsed.success ? parsed.output : undefined
}

function commandDiagnosticCreate(
  root: CommandRoot,
  code: CommandDiagnosticCode,
  message: string,
  absolutePath: string,
  relativePath: string,
): CommandDiagnostic {
  return { code, message, path: absolutePath, precedence: root.precedence, relativePath, source: root.source }
}

function commandDiagnosticAdd(state: CommandDiagnosticState, diagnostic: CommandDiagnostic): void {
  if (state.diagnostics.length < state.maxDiagnostics) {
    state.diagnostics.push(diagnostic)
    return
  }
  state.limitReached = true
}

function commandLimitResolve(value: number | undefined, fallback: number, minimum: number): Result<number> {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > fallback)
    return createResultError("commandCatalogDiscover", "The command discovery limit is invalid.")
  return createResult(resolved)
}

function commandLimitsResolve(options: CommandCatalogDiscoverOptions): Result<CommandLimits> {
  const maxCommands = commandLimitResolve(options.maxCommands, commandDiscoveryLimits.maximumCommands, 0)
  if (!maxCommands.success) return maxCommands
  const maxDiagnostics = commandLimitResolve(options.maxDiagnostics, commandDiscoveryLimits.maximumDiagnostics, 0)
  if (!maxDiagnostics.success) return maxDiagnostics
  const maxDirectoryEntries = commandLimitResolve(
    options.maxDirectoryEntries,
    commandDiscoveryLimits.maximumDirectoryEntries,
    1,
  )
  if (!maxDirectoryEntries.success) return maxDirectoryEntries
  const maxDirectories = commandLimitResolve(options.maxDirectories, commandDiscoveryLimits.maximumDirectories, 1)
  if (!maxDirectories.success) return maxDirectories
  const maxFileBytes = commandLimitResolve(options.maxFileBytes, commandDiscoveryLimits.maximumFileBytes, 0)
  if (!maxFileBytes.success) return maxFileBytes
  const maxTotalBytes = commandLimitResolve(options.maxTotalBytes, commandDiscoveryLimits.maximumTotalBytes, 0)
  if (!maxTotalBytes.success) return maxTotalBytes
  return createResult({
    maxCommands: maxCommands.data,
    maxDiagnostics: maxDiagnostics.data,
    maxDirectoryEntries: maxDirectoryEntries.data,
    maxDirectories: maxDirectories.data,
    maxFileBytes: maxFileBytes.data,
    maxTotalBytes: maxTotalBytes.data,
  })
}

function commandPathOptionResolve(rawPath: string | undefined, defaultPath: string, basePath: string): Result<string> {
  const selected = rawPath ?? defaultPath
  if (typeof selected !== "string" || selected.includes("\0") || selected.includes("\\"))
    return createResultError("commandCatalogDiscover", "The command root path is invalid.")
  const resolved = path.resolve(path.isAbsolute(selected) ? selected : path.resolve(basePath, selected))
  if (!path.isAbsolute(resolved))
    return createResultError("commandCatalogDiscover", "The command root path is invalid.")
  return createResult(resolved)
}

async function commandRootResolve(root: CommandRoot, state: CommandDiagnosticState): Promise<CommandRoot | null> {
  let stat: Awaited<ReturnType<typeof fs.lstat>>
  try {
    stat = await fs.lstat(root.path)
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === "ENOENT" || code === "ENOTDIR") return null
    commandDiagnosticAdd(
      state,
      commandDiagnosticCreate(
        root,
        "directory-unavailable",
        "The command root directory could not be inspected.",
        root.path,
        ".",
      ),
    )
    return null
  }
  if (stat.isSymbolicLink()) {
    commandDiagnosticAdd(
      state,
      commandDiagnosticCreate(
        root,
        "symbolic-link",
        "The command root directory must not be a symbolic link.",
        root.path,
        ".",
      ),
    )
    return null
  }
  if (!stat.isDirectory()) {
    commandDiagnosticAdd(
      state,
      commandDiagnosticCreate(root, "not-regular-file", "The command root must be a directory.", root.path, "."),
    )
    return null
  }
  try {
    const canonicalPath = await fs.realpath(root.path)
    if (canonicalPath !== root.path) {
      commandDiagnosticAdd(
        state,
        commandDiagnosticCreate(
          root,
          "symbolic-link",
          "The command root must not contain a symbolic link.",
          root.path,
          ".",
        ),
      )
      return null
    }
    return { ...root, canonicalPath }
  } catch (_error) {
    commandDiagnosticAdd(
      state,
      commandDiagnosticCreate(
        root,
        "directory-unavailable",
        "The command root could not be canonicalized.",
        root.path,
        ".",
      ),
    )
    return null
  }
}

async function commandDirectoryEntriesRead(
  root: CommandRoot,
  directoryPath: string,
  relativePath: string,
  limits: CommandLimits,
  state: CommandDiagnosticState,
): Promise<Dirent[]> {
  try {
    const canonicalPath = await fs.realpath(directoryPath)
    if (canonicalPath !== directoryPath) {
      commandDiagnosticAdd(
        state,
        commandDiagnosticCreate(
          root,
          "symbolic-link",
          "Command directories must not be symbolic links.",
          directoryPath,
          relativePath,
        ),
      )
      return []
    }
  } catch (_error) {
    commandDiagnosticAdd(
      state,
      commandDiagnosticCreate(
        root,
        "directory-unavailable",
        "The command directory could not be canonicalized.",
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
    commandDiagnosticAdd(
      state,
      commandDiagnosticCreate(
        root,
        "directory-unavailable",
        "The command directory could not be read.",
        directoryPath,
        relativePath,
      ),
    )
    return []
  }
  entries.sort((left, right) => commandPathSort(left.name, right.name))
  if (entries.length <= limits.maxDirectoryEntries) return entries
  commandDiagnosticAdd(
    state,
    commandDiagnosticCreate(
      root,
      "directory-entry-limit-exceeded",
      `The command directory contains more than ${limits.maxDirectoryEntries} entries.`,
      directoryPath,
      relativePath,
    ),
  )
  return entries.slice(0, limits.maxDirectoryEntries)
}

async function commandRootScan(
  root: CommandRoot,
  limits: CommandLimits,
  state: CommandDiagnosticState,
): Promise<CommandRootScan> {
  const candidates: CommandCandidate[] = []
  const directories = [{ absolutePath: root.canonicalPath, relativePath: "." }]
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index]
    if (directory === undefined) continue
    const entries = await commandDirectoryEntriesRead(
      root,
      directory.absolutePath,
      directory.relativePath,
      limits,
      state,
    )
    for (const entry of entries) {
      const absolutePath = path.join(directory.absolutePath, entry.name)
      const relativePath = directory.relativePath === "." ? entry.name : `${directory.relativePath}/${entry.name}`
      let kind: CommandCandidate["kind"]
      try {
        const stat = await fs.lstat(absolutePath)
        kind = stat.isSymbolicLink()
          ? "symbolic-link"
          : stat.isDirectory()
            ? "directory"
            : stat.isFile()
              ? "file"
              : "other"
      } catch (_error) {
        kind = "unavailable"
      }
      if (kind === "file" || kind === "symbolic-link" || kind === "other" || kind === "unavailable") {
        const name = commandNameFromRelativePath(relativePath)
        if (name !== undefined) candidates.push({ absolutePath, kind, name, relativePath, root })
        else if (entry.name.endsWith(".md"))
          commandDiagnosticAdd(
            state,
            commandDiagnosticCreate(
              root,
              "invalid-name",
              "The command file name is invalid.",
              absolutePath,
              relativePath,
            ),
          )
      }
      if (kind !== "directory") continue
      if (directories.length >= limits.maxDirectories) {
        commandDiagnosticAdd(
          state,
          commandDiagnosticCreate(
            root,
            "directory-entry-limit-exceeded",
            `Command discovery is limited to ${limits.maxDirectories} directories.`,
            absolutePath,
            relativePath,
          ),
        )
        continue
      }
      directories.push({ absolutePath, relativePath })
    }
  }
  return { candidates, root }
}

function commandFrontmatterParse(source: string): CommandFrontmatterParseResult {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  if (lines[0] !== "---") return { status: "missing" }
  const closingIndex = lines.findIndex((line, index) => index > 0 && (line === "---" || line === "..."))
  if (closingIndex < 0) return { status: "invalid" }
  let data: unknown
  try {
    const document = parseDocument(lines.slice(1, closingIndex).join("\n"), { uniqueKeys: true })
    if (document.errors.length > 0) return { status: "invalid" }
    data = document.toJS({ mapAsMap: false })
  } catch (_error) {
    return { status: "invalid" }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { status: "invalid" }
  const value = data as Record<string, unknown>
  const parsed = v.safeParse(commandFrontmatterSchema, value)
  if (!parsed.success) return { status: "invalid", value }
  return {
    body: lines
      .slice(closingIndex + 1)
      .join("\n")
      .trim(),
    frontmatter: parsed.output,
    status: "ok",
  }
}

function commandDigestCreate(value: string | Uint8Array): string {
  return `sha256-${createHash("sha256").update(value).digest("hex")}`
}

async function commandSnapshotRead(
  candidate: CommandCandidate,
  limits: CommandLimits,
  state: CommandReadState,
  diagnosticState: CommandDiagnosticState,
  commandCount: number,
): Promise<CommandSnapshot | null> {
  if (candidate.kind === "symbolic-link") {
    commandDiagnosticAdd(
      diagnosticState,
      commandDiagnosticCreate(
        candidate.root,
        "symbolic-link",
        "Command files must not be symbolic links.",
        candidate.absolutePath,
        candidate.relativePath,
      ),
    )
    return null
  }
  if (candidate.kind !== "file") {
    commandDiagnosticAdd(
      diagnosticState,
      commandDiagnosticCreate(
        candidate.root,
        candidate.kind === "unavailable" ? "file-unavailable" : "not-regular-file",
        candidate.kind === "unavailable"
          ? "The command file could not be inspected."
          : "The command file must be a regular file.",
        candidate.absolutePath,
        candidate.relativePath,
      ),
    )
    return null
  }
  if (commandCount >= limits.maxCommands) {
    commandDiagnosticAdd(
      diagnosticState,
      commandDiagnosticCreate(
        candidate.root,
        "command-limit-exceeded",
        `Commands are limited to ${limits.maxCommands} files.`,
        candidate.absolutePath,
        candidate.relativePath,
      ),
    )
    return null
  }
  let canonicalPath = candidate.absolutePath
  try {
    canonicalPath = await fs.realpath(candidate.absolutePath)
  } catch (_error) {
    commandDiagnosticAdd(
      diagnosticState,
      commandDiagnosticCreate(
        candidate.root,
        "file-unavailable",
        "The command file could not be canonicalized.",
        candidate.absolutePath,
        candidate.relativePath,
      ),
    )
    return null
  }
  if (!commandPathIsWithin(candidate.root.canonicalPath, canonicalPath)) {
    commandDiagnosticAdd(
      diagnosticState,
      commandDiagnosticCreate(
        candidate.root,
        "file-unavailable",
        "The command file is outside the command root.",
        canonicalPath,
        candidate.relativePath,
      ),
    )
    return null
  }
  if (state.seenCanonicalPaths.has(canonicalPath)) return null
  state.seenCanonicalPaths.add(canonicalPath)

  let handle: fs.FileHandle | undefined
  try {
    try {
      handle = await fs.open(candidate.absolutePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    } catch (error: unknown) {
      const code = (error as { code?: string }).code
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          code === "ELOOP" || code === "EMLINK" ? "symbolic-link" : "file-unavailable",
          code === "ELOOP" || code === "EMLINK"
            ? "Command files must not be symbolic links."
            : "The command file could not be read.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    const stat = await handle.stat()
    if (!stat.isFile()) {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          "not-regular-file",
          "The command file must be a regular file.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    if (!Number.isSafeInteger(stat.size) || stat.size > limits.maxFileBytes) {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          "file-too-large",
          "The command file exceeds its file budget.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    if (state.totalBytes + stat.size > limits.maxTotalBytes) {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          "total-byte-budget-exceeded",
          "The command discovery byte budget would be exceeded.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    const contentBytes = await handle.readFile()
    if (
      contentBytes.byteLength > limits.maxFileBytes ||
      state.totalBytes + contentBytes.byteLength > limits.maxTotalBytes
    ) {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          contentBytes.byteLength > limits.maxFileBytes ? "file-too-large" : "total-byte-budget-exceeded",
          "The command discovery byte budget would be exceeded.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    if (contentBytes.includes(0)) {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          "binary-content",
          "The command file contains binary content.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    let content: string
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(contentBytes)
    } catch (_error) {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          "invalid-utf8",
          "The command file is not valid UTF-8.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    state.totalBytes += contentBytes.byteLength
    const parsed = commandFrontmatterParse(content)
    if (parsed.status === "missing") {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          "frontmatter-missing",
          "Command files require YAML frontmatter.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    if (parsed.status !== "ok") {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          "invalid-frontmatter",
          "Command frontmatter is invalid.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    if (parsed.body.length === 0) {
      commandDiagnosticAdd(
        diagnosticState,
        commandDiagnosticCreate(
          candidate.root,
          "invalid-frontmatter",
          "The command template must not be empty.",
          canonicalPath,
          candidate.relativePath,
        ),
      )
      return null
    }
    return {
      ...(parsed.frontmatter.agent === undefined ? {} : { agent: parsed.frontmatter.agent }),
      body: parsed.body,
      canonicalPath,
      ...(parsed.frontmatter.description === undefined ? {} : { description: parsed.frontmatter.description }),
      digest: commandDigestCreate(contentBytes),
      ...(parsed.frontmatter.model === undefined ? {} : { model: parsed.frontmatter.model }),
      name: candidate.name,
      precedence: candidate.root.precedence,
      relativePath: candidate.relativePath,
      size: contentBytes.byteLength,
      source: candidate.root.source,
      ...(parsed.frontmatter.subtask === undefined ? {} : { subtask: parsed.frontmatter.subtask }),
      templateDigest: commandDigestCreate(parsed.body),
    }
  } catch (_error) {
    commandDiagnosticAdd(
      diagnosticState,
      commandDiagnosticCreate(
        candidate.root,
        "file-unavailable",
        "The command file could not be read.",
        canonicalPath,
        candidate.relativePath,
      ),
    )
    return null
  } finally {
    if (handle !== undefined) await handle.close().catch(() => undefined)
  }
}

function commandCollisionCandidateCreate(snapshot: CommandSnapshot): CommandCollision["candidates"][number] {
  return {
    canonicalPath: snapshot.canonicalPath,
    digest: snapshot.digest,
    precedence: snapshot.precedence,
    relativePath: snapshot.relativePath,
    source: snapshot.source,
    templateDigest: snapshot.templateDigest,
  }
}

function commandWinnerSort(left: CommandSnapshot, right: CommandSnapshot): number {
  if (left.precedence !== right.precedence) return right.precedence - left.precedence
  const sourceOrder = commandSourceSort(right.source, left.source)
  if (sourceOrder !== 0) return sourceOrder
  return commandPathSort(left.canonicalPath, right.canonicalPath)
}

function commandSnapshotSort(left: CommandSnapshot, right: CommandSnapshot): number {
  const nameOrder = commandPathSort(left.name, right.name)
  if (nameOrder !== 0) return nameOrder
  if (left.precedence !== right.precedence) return left.precedence - right.precedence
  return commandPathSort(left.canonicalPath, right.canonicalPath)
}

function commandDiagnosticSort(left: CommandDiagnostic, right: CommandDiagnostic): number {
  const sourceOrder = commandSourceSort(left.source, right.source)
  if (sourceOrder !== 0) return sourceOrder
  if (left.precedence !== right.precedence) return left.precedence - right.precedence
  const pathOrder = commandPathSort(left.relativePath, right.relativePath)
  if (pathOrder !== 0) return pathOrder
  return commandPathSort(left.code, right.code)
}

function commandCatalogDigestCreate(
  roots: readonly CommandCatalog["roots"][number][],
  commands: readonly CommandSnapshot[],
  collisions: readonly CommandCollision[],
  diagnostics: readonly CommandDiagnostic[],
): string {
  const stable = JSON.stringify({
    collisions: collisions.map(({ candidates, name, winner }) => ({
      candidates: candidates.map(({ digest, precedence, relativePath, source, templateDigest }) => ({
        digest,
        precedence,
        relativePath,
        source,
        templateDigest,
      })),
      name,
      winner: {
        digest: winner.digest,
        precedence: winner.precedence,
        relativePath: winner.relativePath,
        source: winner.source,
        templateDigest: winner.templateDigest,
      },
    })),
    commands: commands.map(
      ({ agent, description, digest, model, name, precedence, relativePath, source, subtask, templateDigest }) => ({
        agent,
        description,
        digest,
        model,
        name,
        precedence,
        relativePath,
        source,
        subtask,
        templateDigest,
      }),
    ),
    diagnostics: diagnostics.map(({ code, relativePath, source }) => ({ code, relativePath, source })),
    roots: roots.map(({ precedence, source }) => ({ precedence, source })),
    version: 1,
  })
  return commandDigestCreate(stable)
}

function commandRootSort(left: CommandRoot, right: CommandRoot): number {
  const sourceOrder = commandSourceSort(left.source, right.source)
  if (sourceOrder !== 0) return sourceOrder
  return commandPathSort(left.path, right.path)
}

function commandSnapshotDeepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) commandSnapshotDeepFreeze(child)
  return value
}

export async function commandCatalogDiscover(options: CommandCatalogDiscoverOptions): Promise<Result<CommandCatalog>> {
  const op = "commandCatalogDiscover"
  const projectRoot = await projectDirectoryCanonicalPathResolve(options.projectRoot)
  if (!projectRoot.success) return createResultError(op, "The project root is invalid.")
  const limits = commandLimitsResolve(options)
  if (!limits.success) return limits

  const globalPath = commandPathOptionResolve(
    options.globalCommandsRoot ?? options.globalCommandsPath,
    path.join(options.homeDirectory ?? os.homedir(), ".agents", "commands"),
    options.homeDirectory ?? os.homedir(),
  )
  if (!globalPath.success) return globalPath
  const projectPath = commandPathOptionResolve(
    options.projectCommandsRoot ?? options.projectCommandsPath,
    path.join(projectRoot.data, ".agents", "commands"),
    projectRoot.data,
  )
  if (!projectPath.success) return projectPath
  if (!commandPathIsWithin(projectRoot.data, projectPath.data))
    return createResultError(op, "The project command root must be inside the project root.")

  const state: CommandDiagnosticState = {
    diagnostics: [],
    limitReached: false,
    maxDiagnostics: limits.data.maxDiagnostics,
  }
  const roots: CommandRoot[] = [
    { canonicalPath: globalPath.data, path: globalPath.data, precedence: 0, source: "global" },
    { canonicalPath: projectPath.data, path: projectPath.data, precedence: 1, source: "project" },
  ]
  roots.sort(commandRootSort)
  const rootResponses: CommandCatalog["roots"] = roots.map(({ canonicalPath, precedence, source }) => ({
    canonicalPath,
    precedence,
    source,
  }))
  const scans: CommandRootScan[] = []
  for (const root of roots) {
    const resolved = await commandRootResolve(root, state)
    if (resolved === null) continue
    const responseRoot = rootResponses.find(({ source }) => source === resolved.source)
    if (responseRoot !== undefined) responseRoot.canonicalPath = resolved.canonicalPath
    scans.push(await commandRootScan(resolved, limits.data, state))
  }

  const candidates = scans
    .flatMap(({ candidates: entries }) => entries)
    .sort((left, right) => {
      const sourceOrder = commandSourceSort(left.root.source, right.root.source)
      if (sourceOrder !== 0) return sourceOrder
      const nameOrder = commandPathSort(left.name, right.name)
      if (nameOrder !== 0) return nameOrder
      return commandPathSort(left.absolutePath, right.absolutePath)
    })
  const readState: CommandReadState = { seenCanonicalPaths: new Set(), totalBytes: 0 }
  const snapshots: CommandSnapshot[] = []
  for (const candidate of candidates) {
    const snapshot = await commandSnapshotRead(candidate, limits.data, readState, state, snapshots.length)
    if (snapshot !== null) snapshots.push(snapshot)
  }
  snapshots.sort(commandSnapshotSort)

  const grouped = new Map<string, CommandSnapshot[]>()
  for (const snapshot of snapshots) grouped.set(snapshot.name, [...(grouped.get(snapshot.name) ?? []), snapshot])
  const commands: CommandSnapshot[] = []
  const collisions: CommandCollision[] = []
  for (const [name, entries] of grouped) {
    const ordered = [...entries].sort(commandWinnerSort)
    const winner = ordered[0]
    if (winner === undefined) continue
    commands.push(winner)
    if (ordered.length > 1)
      collisions.push({
        candidates: ordered.map(commandCollisionCandidateCreate),
        name,
        winner: commandCollisionCandidateCreate(winner),
      })
  }
  commands.sort((left, right) => commandPathSort(left.name, right.name))
  collisions.sort((left, right) => commandPathSort(left.name, right.name))
  const diagnostics = [...state.diagnostics].sort(commandDiagnosticSort)
  if (state.limitReached && limits.data.maxDiagnostics > 0) {
    diagnostics.splice(
      limits.data.maxDiagnostics - 1,
      1,
      commandDiagnosticCreate(
        { canonicalPath: projectRoot.data, path: projectRoot.data, precedence: 1, source: "project" },
        "diagnostic-limit-exceeded",
        `Command diagnostics are limited to ${limits.data.maxDiagnostics} entries.`,
        projectRoot.data,
        ".",
      ),
    )
    diagnostics.sort(commandDiagnosticSort)
  }
  const digest = commandCatalogDigestCreate(rootResponses, commands, collisions, diagnostics)
  const catalog = { collisions, commands, diagnostics, digest, roots: rootResponses, version: 1 as const }
  const parsed = v.safeParse(commandCatalogSchema, catalog)
  if (!parsed.success) return createResultError(op, "The discovered command catalog is invalid.")
  return createResult(commandSnapshotDeepFreeze(structuredClone(parsed.output)))
}
