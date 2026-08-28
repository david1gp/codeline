import * as crypto from "node:crypto"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { projectDirectoryCanonicalPathResolve } from "../../project/projectDirectoryCanonicalPathResolve.js"
import { agentInstructionDiscoveryLimits } from "../agentInstructionDiscoveryLimits.js"
import {
  type AgentInstructionSnapshot,
  agentInstructionSnapshotSchema,
} from "../schema/agentInstructionSnapshotSchema.js"

type AgentInstructionSnapshotEntry = AgentInstructionSnapshot["snapshots"][number]
type AgentInstructionValidationDiagnostic = AgentInstructionSnapshot["diagnostics"][number]
type AgentInstructionValidationCode = AgentInstructionValidationDiagnostic["code"]
type AgentInstructionSource = AgentInstructionValidationDiagnostic["source"]

type AgentInstructionsDiscoverOptions = {
  globalAgentsPath?: string
  maxDirectories?: number
  maxFileBytes?: number
  maxSnapshots?: number
  maxTotalBytes?: number
  projectRoot: string
  workingDirectory?: string
}

type AgentInstructionCandidate = {
  path: string
  precedence: number
  scope: string
  source: AgentInstructionSource
}

type AgentInstructionDirectory = {
  path: string
  precedence: number
  scope: string
}

type AgentInstructionReadState = {
  seenCanonicalPaths: Set<string>
  totalBytes: number
}

/**
 * Dependency, VCS, and build directories are not authored project scopes. They stay
 * excluded even when a selected working directory is nested below one of them.
 */
const agentInstructionsExcludedDirectoryNames: ReadonlySet<string> = new Set([
  ".cache",
  ".git",
  ".hg",
  ".next",
  ".output",
  ".svn",
  ".turbo",
  ".venv",
  "bower_components",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
  "vendor",
  "venv",
])

function agentInstructionsDirectoryIsExcluded(name: string): boolean {
  return agentInstructionsExcludedDirectoryNames.has(name)
}

function agentInstructionsPathSort(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function agentInstructionsPathIsWithin(rootDir: string, targetPath: string): boolean {
  const relativePath = path.relative(rootDir, targetPath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== ".." && !path.isAbsolute(relativePath))
  )
}

function agentInstructionsScopeResolve(rootDir: string, directoryPath: string): string {
  const relativePath = path.relative(rootDir, directoryPath)
  return relativePath === "" ? "." : relativePath.split(path.sep).join("/")
}

function agentInstructionsDiagnosticCreate(
  candidate: AgentInstructionCandidate,
  code: AgentInstructionValidationCode,
  message: string,
  diagnosticPath: string = candidate.path,
): AgentInstructionValidationDiagnostic {
  return {
    code,
    message,
    path: diagnosticPath,
    precedence: candidate.precedence,
    scope: candidate.scope,
    source: candidate.source,
  }
}

function agentInstructionsDirectoryCandidateCreate(directory: AgentInstructionDirectory): AgentInstructionCandidate {
  return {
    path: path.join(directory.path, "AGENTS.md"),
    precedence: directory.precedence,
    scope: directory.scope,
    source: "project",
  }
}

function agentInstructionsLimitResolve(
  value: number | undefined,
  fallback: number,
  maximum: number,
  minimum: number,
): Result<number> {
  const resolved = value ?? fallback
  if (!Number.isSafeInteger(resolved) || resolved < minimum || resolved > maximum) {
    return createResultError("agentInstructionsDiscover", "The instruction discovery limit is invalid.")
  }
  return createResult(resolved)
}

async function agentInstructionsDirectoriesRead(
  projectRoot: string,
  workingDirectory: string,
  maximumDirectories: number,
  diagnostics: AgentInstructionValidationDiagnostic[],
): Promise<AgentInstructionDirectory[]> {
  const directories: AgentInstructionDirectory[] = [
    {
      path: projectRoot,
      precedence: 1,
      scope: ".",
    },
  ]

  const relativeWorkingDirectory = path.relative(projectRoot, workingDirectory)
  const segments = relativeWorkingDirectory === "" ? [] : relativeWorkingDirectory.split(path.sep)
  for (const segment of segments) {
    if (agentInstructionsDirectoryIsExcluded(segment)) break
    const parent = directories[directories.length - 1]
    if (parent === undefined) break
    if (directories.length >= maximumDirectories) {
      diagnostics.push(
        agentInstructionsDiagnosticCreate(
          agentInstructionsDirectoryCandidateCreate(parent),
          "directory-entry-limit-exceeded",
          `Instruction discovery is limited to ${maximumDirectories} directories.`,
          parent.path,
        ),
      )
      return directories
    }

    const directoryPath = path.join(parent.path, segment)
    directories.push({
      path: directoryPath,
      precedence: parent.precedence + 1,
      scope: agentInstructionsScopeResolve(projectRoot, directoryPath),
    })
  }

  return directories
}

function agentInstructionsCandidatesRead(
  projectRoot: string,
  globalAgentsPath: string,
  directories: readonly AgentInstructionDirectory[],
): AgentInstructionCandidate[] {
  const candidates: AgentInstructionCandidate[] = [
    {
      path: globalAgentsPath,
      precedence: 0,
      scope: "global",
      source: "global",
    },
    ...directories.map(agentInstructionsDirectoryCandidateCreate),
  ]

  candidates.sort((left, right) => {
    if (left.precedence !== right.precedence) return left.precedence - right.precedence
    return agentInstructionsPathSort(left.path, right.path)
  })

  const seenPaths = new Set<string>()
  return candidates.filter((candidate) => {
    const absolutePath = path.resolve(candidate.path)
    if (seenPaths.has(absolutePath)) return false
    seenPaths.add(absolutePath)
    return agentInstructionsPathIsWithin(projectRoot, absolutePath) || candidate.source === "global"
  })
}

function agentInstructionsDigestCreate(content: Buffer): string {
  return `sha256-${crypto.createHash("sha256").update(content).digest("hex")}`
}

async function agentInstructionsCandidateSnapshotRead(
  candidate: AgentInstructionCandidate,
  projectRoot: string,
  limits: { maxFileBytes: number; maxSnapshots: number; maxTotalBytes: number },
  state: AgentInstructionReadState,
  diagnostics: AgentInstructionValidationDiagnostic[],
  snapshots: AgentInstructionSnapshotEntry[],
): Promise<void> {
  let candidateStat: Awaited<ReturnType<typeof fs.lstat>>
  try {
    candidateStat = await fs.lstat(candidate.path)
  } catch (error: unknown) {
    const code = (error as { code?: string }).code
    if (code === "ENOENT" || code === "ENOTDIR") return
    diagnostics.push(
      agentInstructionsDiagnosticCreate(candidate, "file-unavailable", "The AGENTS.md file could not be inspected."),
    )
    return
  }

  if (candidateStat.isSymbolicLink()) {
    diagnostics.push(
      agentInstructionsDiagnosticCreate(candidate, "symbolic-link", "AGENTS.md must not be a symbolic link."),
    )
    return
  }
  if (!candidateStat.isFile()) {
    diagnostics.push(
      agentInstructionsDiagnosticCreate(candidate, "not-regular-file", "AGENTS.md must be a regular file."),
    )
    return
  }

  let canonicalPath: string
  try {
    canonicalPath = await fs.realpath(candidate.path)
  } catch (_error) {
    diagnostics.push(
      agentInstructionsDiagnosticCreate(
        candidate,
        "file-unavailable",
        "The AGENTS.md file could not be canonicalized.",
      ),
    )
    return
  }

  if (candidate.source === "project" && !agentInstructionsPathIsWithin(projectRoot, canonicalPath)) {
    diagnostics.push(
      agentInstructionsDiagnosticCreate(candidate, "file-unavailable", "AGENTS.md is outside the project root."),
    )
    return
  }
  if (state.seenCanonicalPaths.has(canonicalPath)) return
  state.seenCanonicalPaths.add(canonicalPath)

  if (snapshots.length >= limits.maxSnapshots) {
    diagnostics.push(
      agentInstructionsDiagnosticCreate(
        candidate,
        "snapshot-limit-exceeded",
        `Instruction snapshots are limited to ${limits.maxSnapshots} files.`,
        canonicalPath,
      ),
    )
    return
  }

  let handle: fs.FileHandle | undefined
  try {
    try {
      handle = await fs.open(candidate.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    } catch (error: unknown) {
      const code = (error as { code?: string }).code
      diagnostics.push(
        agentInstructionsDiagnosticCreate(
          candidate,
          code === "ELOOP" || code === "EMLINK" ? "symbolic-link" : "file-unavailable",
          code === "ELOOP" || code === "EMLINK"
            ? "AGENTS.md must not be a symbolic link."
            : "The AGENTS.md file could not be read.",
          canonicalPath,
        ),
      )
      return
    }

    const fileStat = await handle.stat()
    if (!fileStat.isFile()) {
      diagnostics.push(
        agentInstructionsDiagnosticCreate(
          candidate,
          "not-regular-file",
          "AGENTS.md must be a regular file.",
          canonicalPath,
        ),
      )
      return
    }
    if (!Number.isSafeInteger(fileStat.size) || fileStat.size > limits.maxFileBytes) {
      diagnostics.push(
        agentInstructionsDiagnosticCreate(
          candidate,
          "file-too-large",
          `AGENTS.md exceeds the ${limits.maxFileBytes}-byte file budget.`,
          canonicalPath,
        ),
      )
      return
    }
    if (state.totalBytes + fileStat.size > limits.maxTotalBytes) {
      diagnostics.push(
        agentInstructionsDiagnosticCreate(
          candidate,
          "total-byte-budget-exceeded",
          `The ${limits.maxTotalBytes}-byte instruction budget would be exceeded.`,
          canonicalPath,
        ),
      )
      return
    }

    const contentBytes = await handle.readFile()
    if (contentBytes.byteLength > limits.maxFileBytes) {
      diagnostics.push(
        agentInstructionsDiagnosticCreate(
          candidate,
          "file-too-large",
          `AGENTS.md exceeds the ${limits.maxFileBytes}-byte file budget.`,
          canonicalPath,
        ),
      )
      return
    }
    if (state.totalBytes + contentBytes.byteLength > limits.maxTotalBytes) {
      diagnostics.push(
        agentInstructionsDiagnosticCreate(
          candidate,
          "total-byte-budget-exceeded",
          `The ${limits.maxTotalBytes}-byte instruction budget would be exceeded.`,
          canonicalPath,
        ),
      )
      return
    }
    if (contentBytes.includes(0)) {
      diagnostics.push(
        agentInstructionsDiagnosticCreate(
          candidate,
          "binary-content",
          "AGENTS.md contains binary content.",
          canonicalPath,
        ),
      )
      return
    }

    let content: string
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(contentBytes)
    } catch (_error) {
      diagnostics.push(
        agentInstructionsDiagnosticCreate(candidate, "invalid-utf8", "AGENTS.md is not valid UTF-8.", canonicalPath),
      )
      return
    }

    state.totalBytes += contentBytes.byteLength
    snapshots.push({
      canonicalPath,
      content,
      digest: agentInstructionsDigestCreate(contentBytes),
      precedence: candidate.precedence,
      scope: candidate.scope,
      size: contentBytes.byteLength,
      source: candidate.source,
    })
  } catch (_error) {
    diagnostics.push(
      agentInstructionsDiagnosticCreate(
        candidate,
        "file-unavailable",
        "The AGENTS.md file could not be read.",
        canonicalPath,
      ),
    )
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close()
      } catch (_error) {
        // The content has already been copied into the immutable snapshot.
      }
    }
  }
}

function agentInstructionsDiagnosticsSort(
  left: AgentInstructionValidationDiagnostic,
  right: AgentInstructionValidationDiagnostic,
): number {
  if (left.precedence !== right.precedence) return left.precedence - right.precedence
  const pathOrder = agentInstructionsPathSort(left.path, right.path)
  if (pathOrder !== 0) return pathOrder
  return agentInstructionsPathSort(left.code, right.code)
}

export async function agentInstructionsDiscover(
  options: AgentInstructionsDiscoverOptions,
): Promise<Result<AgentInstructionSnapshot>> {
  const op = "agentInstructionsDiscover"
  const projectRoot = await projectDirectoryCanonicalPathResolve(options.projectRoot)
  if (!projectRoot.success) return createResultError(op, "The project root is invalid.")

  const workingDirectory = await projectDirectoryCanonicalPathResolve(options.workingDirectory ?? projectRoot.data)
  if (!workingDirectory.success || !agentInstructionsPathIsWithin(projectRoot.data, workingDirectory.data)) {
    return createResultError(op, "The instruction working directory is invalid.")
  }

  const maxDirectories = agentInstructionsLimitResolve(
    options.maxDirectories,
    agentInstructionDiscoveryLimits.maximumDirectories,
    agentInstructionDiscoveryLimits.maximumDirectories,
    1,
  )
  if (!maxDirectories.success) return maxDirectories
  const maxFileBytes = agentInstructionsLimitResolve(
    options.maxFileBytes,
    agentInstructionDiscoveryLimits.maximumFileBytes,
    agentInstructionDiscoveryLimits.maximumFileBytes,
    0,
  )
  if (!maxFileBytes.success) return maxFileBytes
  const maxSnapshots = agentInstructionsLimitResolve(
    options.maxSnapshots,
    agentInstructionDiscoveryLimits.maximumSnapshots,
    agentInstructionDiscoveryLimits.maximumSnapshots,
    0,
  )
  if (!maxSnapshots.success) return maxSnapshots
  const maxTotalBytes = agentInstructionsLimitResolve(
    options.maxTotalBytes,
    agentInstructionDiscoveryLimits.maximumTotalBytes,
    agentInstructionDiscoveryLimits.maximumTotalBytes,
    0,
  )
  if (!maxTotalBytes.success) return maxTotalBytes

  const globalAgentsPath = path.resolve(options.globalAgentsPath ?? path.join(os.homedir(), ".agents", "AGENTS.md"))
  const diagnostics: AgentInstructionValidationDiagnostic[] = []
  const directories = await agentInstructionsDirectoriesRead(
    projectRoot.data,
    workingDirectory.data,
    maxDirectories.data,
    diagnostics,
  )
  const candidates = agentInstructionsCandidatesRead(projectRoot.data, globalAgentsPath, directories)
  const snapshots: AgentInstructionSnapshotEntry[] = []
  const state: AgentInstructionReadState = { seenCanonicalPaths: new Set(), totalBytes: 0 }

  for (const candidate of candidates) {
    await agentInstructionsCandidateSnapshotRead(
      candidate,
      projectRoot.data,
      {
        maxFileBytes: maxFileBytes.data,
        maxSnapshots: maxSnapshots.data,
        maxTotalBytes: maxTotalBytes.data,
      },
      state,
      diagnostics,
      snapshots,
    )
  }

  snapshots.sort((left, right) => {
    if (left.precedence !== right.precedence) return left.precedence - right.precedence
    return agentInstructionsPathSort(left.canonicalPath, right.canonicalPath)
  })
  diagnostics.sort(agentInstructionsDiagnosticsSort)

  const snapshot: AgentInstructionSnapshot = {
    diagnostics,
    snapshots,
    version: 1,
  }
  const parsed = v.safeParse(agentInstructionSnapshotSchema, snapshot)
  if (!parsed.success) return createResultError(op, "The agent instruction snapshot is invalid.")
  return createResult(parsed.output)
}
