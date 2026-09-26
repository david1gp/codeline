import { createHash, randomUUID } from "node:crypto"
import type { BigIntStats, Dirent, Stats } from "node:fs"
import { createReadStream } from "node:fs"
import {
  link,
  mkdir,
  lstat as nodeLstat,
  stat as nodeStat,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, resolve as pathResolve, relative, sep } from "node:path"
import { pathToFileURL } from "node:url"
import { TextDecoder } from "node:util"
import type { FileEditOutcome, FileEditRequest, FileWriteIntent, FileWriteOutcome } from "./fileSystem.js"
import { FileSystem } from "./fileSystem.js"
import { FileSystemError } from "./fileSystemError.js"
import type { FileDirEntry, FileInfo, FilePathInfo, FileTarget } from "./fileTarget.js"
import { fileTargetKey } from "./fileTarget.js"
import { fileTextReplacementApply } from "./fileTextReplacementApply.js"
import type { FileVersion } from "./fileVersion.js"
import { fileVersion } from "./fileVersion.js"

const BINARY_SAMPLE_BYTES = 8192

type PathInfo = {
  readonly version: FileVersion
  readonly type: "file" | "directory" | "other"
  readonly size: number
}

type PathLinkInfo = {
  readonly version: FileVersion
  readonly type: "file" | "directory" | "symlink" | "other"
  readonly size: number
}

type LineEndings = "LF" | "CRLF"

type NodeFsError = Error & { readonly code?: string }

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined
  return (error as NodeFsError).code
}

function isCode(error: unknown, code: string): boolean {
  return errorCode(error) === code
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function throwIfAborted(signal: AbortSignal | undefined, verb: string): void {
  if (signal?.aborted) throw new FileSystemError(`${verb} aborted`, "FS_ABORTED")
}

function mapIoError(error: unknown, displayPath: string, verb: string): FileSystemError {
  if (error instanceof FileSystemError) return error
  if (isAbortError(error)) return new FileSystemError(`${verb} aborted`, "FS_ABORTED", { cause: error })
  if (isCode(error, "ENOENT"))
    return new FileSystemError(`cannot ${verb} "${displayPath}": not found`, "FS_NOT_FOUND", { cause: error })
  if (isCode(error, "ENOTDIR")) {
    return new FileSystemError(`cannot ${verb} "${displayPath}": not found`, "FS_NOT_FOUND", { cause: error })
  }
  if (isCode(error, "EACCES") || isCode(error, "EPERM")) {
    return new FileSystemError(`cannot ${verb} "${displayPath}": permission denied`, "FS_PERMISSION_DENIED", {
      cause: error,
    })
  }
  return new FileSystemError(`cannot ${verb} "${displayPath}": ${errorMessage(error)}`, "FS_IO_ERROR", { cause: error })
}

function mapWriteError(error: unknown, displayPath: string): FileSystemError {
  if (error instanceof FileSystemError) return error
  if (isCode(error, "EISDIR")) {
    return new FileSystemError(`cannot write "${displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE", {
      cause: error,
    })
  }
  return mapIoError(error, displayPath, "write")
}

function normalizeInputPath(basePath: string, inputPath: string): string {
  if (inputPath.trim().length === 0) throw new FileSystemError("file_path must be a non-empty string", "FS_NOT_FOUND")
  const expanded =
    inputPath === "~" || inputPath.startsWith(`~${sep}`) || inputPath.startsWith("~/")
      ? join(homedir(), inputPath === "~" ? "" : inputPath.slice(2))
      : inputPath
  return pathResolve(basePath, expanded)
}

async function versionOf(info: BigIntStats, absolutePath: string, includeContentHash: boolean): Promise<FileVersion> {
  let contentHash = ""
  if (includeContentHash && info.isFile()) {
    contentHash = createHash("sha256")
      .update(await readFile(absolutePath))
      .digest("hex")
  }
  return fileVersion(`${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}:${contentHash}`)
}

function pathType(info: Stats | BigIntStats): PathInfo["type"] {
  if (info.isFile()) return "file"
  if (info.isDirectory()) return "directory"
  return "other"
}

function pathLinkType(info: Stats | BigIntStats): PathLinkInfo["type"] {
  if (info.isSymbolicLink()) return "symlink"
  return pathType(info)
}

async function pathProbe(absolutePath: string, includeContentHash = true): Promise<PathInfo | null> {
  let info: BigIntStats
  try {
    info = await nodeStat(absolutePath, { bigint: true })
  } catch (error: unknown) {
    if (isCode(error, "ENOENT") || isCode(error, "ENOTDIR")) return null
    throw error
  }
  return {
    version: await versionOf(info, absolutePath, includeContentHash),
    type: pathType(info),
    size: Number(info.size),
  }
}

async function pathProbeNoFollow(absolutePath: string): Promise<PathLinkInfo | null> {
  let info: BigIntStats
  try {
    info = await nodeLstat(absolutePath, { bigint: true })
  } catch (error: unknown) {
    if (isCode(error, "ENOENT") || isCode(error, "ENOTDIR")) return null
    throw error
  }
  return {
    version: await versionOf(info, absolutePath, false),
    type: pathLinkType(info),
    size: Number(info.size),
  }
}

async function resolveLocalTarget(basePath: string, inputPath: string, signal?: AbortSignal): Promise<FileTarget> {
  throwIfAborted(signal, "resolve")
  const displayPath = normalizeInputPath(basePath, inputPath)
  try {
    const target = await realpath(displayPath)
    throwIfAborted(signal, "resolve")
    return { displayPath, targetKey: fileTargetKey(target) }
  } catch (error: unknown) {
    throwIfAborted(signal, "resolve")
    if (!isCode(error, "ENOENT")) {
      if (isCode(error, "ENOTDIR")) {
        throw new FileSystemError(
          `cannot resolve "${displayPath}": a parent path segment is not a directory`,
          "FS_NOT_FOUND",
          { cause: error },
        )
      }
      throw mapIoError(error, displayPath, "resolve")
    }
  }

  const missing = [basename(displayPath)]
  let ancestor = dirname(displayPath)
  while (true) {
    throwIfAborted(signal, "resolve")
    try {
      const realAncestor = await realpath(ancestor)
      throwIfAborted(signal, "resolve")
      return { displayPath, targetKey: fileTargetKey(join(realAncestor, ...missing)) }
    } catch (error: unknown) {
      throwIfAborted(signal, "resolve")
      if (!isCode(error, "ENOENT")) {
        if (isCode(error, "ENOTDIR")) {
          throw new FileSystemError(
            `cannot resolve "${displayPath}": a parent path segment is not a directory`,
            "FS_NOT_FOUND",
            { cause: error },
          )
        }
        throw mapIoError(error, displayPath, "resolve")
      }
      const parent = dirname(ancestor)
      if (parent === ancestor) return { displayPath, targetKey: fileTargetKey(displayPath) }
      missing.unshift(basename(ancestor))
      ancestor = parent
    }
  }
}

async function regularFileStat(target: FileTarget, verb: "read" | "edit", signal?: AbortSignal): Promise<Stats> {
  throwIfAborted(signal, verb)
  let info: Stats
  try {
    info = await nodeStat(target.targetKey)
  } catch (error: unknown) {
    throw mapIoError(error, target.displayPath, verb)
  }
  throwIfAborted(signal, verb)
  if (!info.isFile()) {
    throw new FileSystemError(`cannot ${verb} "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE")
  }
  return info
}

async function readFileAbortable(target: FileTarget, verb: "read" | "edit", signal?: AbortSignal): Promise<Buffer> {
  try {
    return await readFile(target.targetKey, signal ? { signal } : {})
  } catch (error: unknown) {
    throw mapIoError(error, target.displayPath, verb)
  }
}

function decodeUtf8(bytes: Uint8Array, target: FileTarget, verb: "read" | "edit"): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    if (error instanceof TypeError) {
      throw new FileSystemError(`cannot ${verb} "${target.displayPath}": invalid UTF-8 text`, "FS_NOT_TEXT", {
        cause: error,
      })
    }
    throw error
  }
}

function normalizeLineEndings(content: string): string {
  return content.replaceAll("\r\n", "\n")
}

function detectLineEndings(content: string): LineEndings {
  let crlf = 0
  let lf = 0
  for (let index = 0; index < Math.min(content.length, 4096); index += 1) {
    if (content[index] !== "\n") continue
    if (index > 0 && content[index - 1] === "\r") crlf += 1
    else lf += 1
  }
  return crlf > lf ? "CRLF" : "LF"
}

function restoreLineEndings(content: string, lineEndings: LineEndings): string {
  if (lineEndings === "LF") return content
  return normalizeLineEndings(content).split("\n").join("\r\n")
}

async function readTextContent(target: FileTarget, signal?: AbortSignal): Promise<string> {
  await regularFileStat(target, "read", signal)
  const bytes = await readFileAbortable(target, "read", signal)
  throwIfAborted(signal, "read")
  if (bytes.subarray(0, BINARY_SAMPLE_BYTES).includes(0)) {
    throw new FileSystemError(`cannot read "${target.displayPath}": binary file`, "FS_NOT_TEXT")
  }
  return decodeUtf8(bytes, target, "read")
}

async function* streamTextContent(target: FileTarget, signal?: AbortSignal): AsyncIterable<string> {
  await regularFileStat(target, "read", signal)
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let sampledBytes = 0
  let stream: ReturnType<typeof createReadStream> | undefined
  try {
    stream = createReadStream(target.targetKey, signal ? { signal } : {})
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      throwIfAborted(signal, "read")
      if (sampledBytes < BINARY_SAMPLE_BYTES) {
        const sample = chunk.subarray(0, Math.min(chunk.length, BINARY_SAMPLE_BYTES - sampledBytes))
        if (sample.includes(0)) {
          throw new FileSystemError(`cannot read "${target.displayPath}": binary file`, "FS_NOT_TEXT")
        }
        sampledBytes += sample.length
      }
      try {
        yield decoder.decode(chunk, { stream: true })
      } catch (error: unknown) {
        if (error instanceof TypeError) {
          throw new FileSystemError(`cannot read "${target.displayPath}": invalid UTF-8 text`, "FS_NOT_TEXT", {
            cause: error,
          })
        }
        throw error
      }
    }
    try {
      yield decoder.decode()
    } catch (error: unknown) {
      if (error instanceof TypeError) {
        throw new FileSystemError(`cannot read "${target.displayPath}": invalid UTF-8 text`, "FS_NOT_TEXT", {
          cause: error,
        })
      }
      throw error
    }
    throwIfAborted(signal, "read")
  } catch (error: unknown) {
    if (error instanceof FileSystemError) throw error
    throw mapIoError(error, target.displayPath, "read")
  } finally {
    stream?.destroy()
  }
}

async function readBytesContent(
  target: FileTarget,
  signal: AbortSignal | undefined,
  maxBytes: number,
): Promise<Uint8Array> {
  const info = await regularFileStat(target, "read", signal)
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new FileSystemError(`cannot read "${target.displayPath}": invalid byte limit`, "FS_TOO_LARGE")
  }
  if (info.size > maxBytes) {
    throw new FileSystemError(
      `cannot read "${target.displayPath}": ${info.size} bytes exceeds the ${maxBytes}-byte limit`,
      "FS_TOO_LARGE",
    )
  }

  let stream: ReturnType<typeof createReadStream> | undefined
  const chunks: Buffer[] = []
  let bytes = 0
  try {
    stream = createReadStream(target.targetKey, { end: maxBytes, ...(signal ? { signal } : {}) })
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      throwIfAborted(signal, "read")
      bytes += chunk.length
      if (bytes > maxBytes) {
        throw new FileSystemError(
          `cannot read "${target.displayPath}": content exceeds the ${maxBytes}-byte limit`,
          "FS_TOO_LARGE",
        )
      }
      chunks.push(chunk)
    }
    throwIfAborted(signal, "read")
  } catch (error: unknown) {
    if (error instanceof FileSystemError) throw error
    throw mapIoError(error, target.displayPath, "read")
  } finally {
    stream?.destroy()
  }
  return Buffer.concat(chunks, bytes)
}

async function readEditContent(
  target: FileTarget,
  signal?: AbortSignal,
): Promise<{ content: string; lineEndings: LineEndings; hasBom: boolean }> {
  throwIfAborted(signal, "edit")
  const bytes = await readFileAbortable(target, "edit", signal)
  throwIfAborted(signal, "edit")
  if (bytes.includes(0)) throw new FileSystemError(`cannot edit "${target.displayPath}": binary file`, "FS_NOT_TEXT")
  const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const decoded = decodeUtf8(bytes, target, "edit")
  return { content: normalizeLineEndings(decoded), lineEndings: detectLineEndings(decoded), hasBom }
}

async function writeFileAtomic(
  target: FileTarget,
  content: string,
  signal: AbortSignal | undefined,
  createIfAbsent: boolean,
): Promise<void> {
  throwIfAborted(signal, "write")
  let directory: string
  try {
    directory = dirname(target.targetKey)
    await mkdir(directory, { recursive: true })
  } catch (error: unknown) {
    throw mapWriteError(error, target.displayPath)
  }
  throwIfAborted(signal, "write")

  const stagingDir = join(directory, `.${basename(target.targetKey)}.${process.pid}.${randomUUID()}.tmpdir`)
  const tempPath = join(stagingDir, `${basename(target.targetKey)}.tmp`)
  let stagingCreated = false
  let published = false
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    await mkdir(stagingDir, { mode: 0o700 })
    stagingCreated = true
    handle = await open(tempPath, "wx", 0o600)
    await handle.writeFile(content, { encoding: "utf8", ...(signal ? { signal } : {}) })
    await handle.sync()
    await handle.close()
    handle = undefined

    throwIfAborted(signal, "write")
    if (createIfAbsent) {
      try {
        await link(tempPath, target.targetKey)
      } catch (error: unknown) {
        let competitor: BigIntStats | undefined
        try {
          competitor = await nodeLstat(target.targetKey, { bigint: true })
        } catch (inspectionError: unknown) {
          if (!isCode(inspectionError, "ENOENT") && !isCode(inspectionError, "ENOTDIR")) {
            throw mapWriteError(inspectionError, target.displayPath)
          }
        }
        if (competitor && !competitor.isFile()) {
          throw new FileSystemError(`cannot write "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE", {
            cause: error,
          })
        }
        if (competitor || isCode(error, "EEXIST")) {
          throw new FileSystemError(
            `cannot overwrite existing "${target.displayPath}" without reading it first`,
            "FS_NOT_OBSERVED",
            { cause: error },
          )
        }
        throw mapWriteError(error, target.displayPath)
      }
    } else {
      await rename(tempPath, target.targetKey)
    }
    published = true
  } catch (error: unknown) {
    if (handle) {
      try {
        await handle.close()
      } catch {
        // The original publication error is the useful failure.
      }
    }
    if (stagingCreated) await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
    if (error instanceof FileSystemError) throw error
    if (isAbortError(error)) throw new FileSystemError("write aborted", "FS_ABORTED", { cause: error })
    throw mapWriteError(error, target.displayPath)
  }

  if (published && stagingCreated) await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
}

async function readWriteBasis(target: FileTarget, signal?: AbortSignal): Promise<string | null> {
  try {
    return normalizeLineEndings(await readTextContent(target, signal))
  } catch (error: unknown) {
    if (error instanceof FileSystemError && error.code === "FS_ABORTED") throw error
    if (error instanceof FileSystemError && (error.code === "FS_NOT_TEXT" || error.code === "FS_NOT_FOUND")) return null
    return null
  }
}

async function versionAfterWrite(target: FileTarget): Promise<FileVersion> {
  const current = await pathProbe(target.targetKey)
  return current?.version ?? fileVersion(`missing:${target.targetKey}`)
}

async function waitForLock(prior: Promise<void>, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) {
    await prior
    return
  }
  throwIfAborted(signal, "write")
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const abort = (): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", abort)
      reject(new FileSystemError("write aborted", "FS_ABORTED"))
    }
    signal.addEventListener("abort", abort, { once: true })
    prior.then(
      () => {
        if (settled) return
        settled = true
        signal.removeEventListener("abort", abort)
        resolve()
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        signal.removeEventListener("abort", abort)
        reject(error)
      },
    )
  })
}

class LocalFileSystem extends FileSystem {
  private readonly cwd: string
  private readonly locks = new Map<string, Promise<void>>()

  constructor(cwd: string) {
    super()
    this.cwd = normalizeInputPath(process.cwd(), cwd)
  }

  private async withLock<T>(
    targetKey: string,
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    const prior = this.locks.get(targetKey) ?? Promise.resolve()
    let release: (() => void) | undefined
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.locks.set(targetKey, current)
    try {
      await waitForLock(prior, signal)
      throwIfAborted(signal, "write")
      return await operation()
    } finally {
      release?.()
      if (this.locks.get(targetKey) === current) this.locks.delete(targetKey)
    }
  }

  async resolve(path: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<FileTarget> {
    return resolveLocalTarget(options?.cwd ?? this.cwd, path, options?.signal)
  }

  processPath(target: FileTarget): string {
    return String(target.targetKey)
  }

  fileUrl(target: FileTarget): string {
    return pathToFileURL(this.processPath(target)).href
  }

  contains(parent: FileTarget, child: FileTarget): boolean {
    const childPath = relative(this.processPath(parent), this.processPath(child))
    return childPath === "" || (childPath !== ".." && !childPath.startsWith(`..${sep}`) && !isAbsolute(childPath))
  }

  async stat(target: FileTarget, signal?: AbortSignal): Promise<FileInfo | undefined> {
    throwIfAborted(signal, "stat")
    let info: PathInfo | null
    try {
      info = await pathProbe(target.targetKey)
    } catch (error: unknown) {
      throw mapIoError(error, target.displayPath, "stat")
    }
    throwIfAborted(signal, "stat")
    if (!info) return undefined
    return { version: info.version, type: info.type, size: info.size }
  }

  async lstat(path: string, options?: { cwd?: string }, signal?: AbortSignal): Promise<FilePathInfo | undefined> {
    throwIfAborted(signal, "lstat")
    const absolutePath = normalizeInputPath(options?.cwd ?? this.cwd, path)
    let info: PathLinkInfo | null
    try {
      info = await pathProbeNoFollow(absolutePath)
    } catch (error: unknown) {
      throw mapIoError(error, absolutePath, "lstat")
    }
    throwIfAborted(signal, "lstat")
    if (!info) return undefined
    return { version: info.version, type: info.type, size: info.size }
  }

  async readText(target: FileTarget, signal?: AbortSignal): Promise<string> {
    return readTextContent(target, signal)
  }

  streamText(target: FileTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    return Promise.resolve(streamTextContent(target, signal))
  }

  async readBytes(target: FileTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array> {
    return readBytesContent(target, signal, maxBytes)
  }

  async listDir(target: FileTarget, signal?: AbortSignal): Promise<FileDirEntry[]> {
    throwIfAborted(signal, "list")
    let info: PathInfo | null
    try {
      info = await pathProbe(target.targetKey)
    } catch (error: unknown) {
      throw mapIoError(error, target.displayPath, "list")
    }
    if (!info) throw new FileSystemError(`cannot list "${target.displayPath}": not found`, "FS_NOT_FOUND")
    if (info.type !== "directory")
      throw new FileSystemError(`cannot list "${target.displayPath}": not a directory`, "FS_NOT_DIRECTORY")

    let entries: Dirent[]
    try {
      entries = await readdir(target.targetKey, { withFileTypes: true, encoding: "utf8" })
    } catch (error: unknown) {
      throw mapIoError(error, target.displayPath, "list")
    }
    const result: FileDirEntry[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      throwIfAborted(signal, "list")
      const childDisplayPath = join(target.displayPath, entry.name)
      let childTarget: FileTarget
      try {
        childTarget = await resolveLocalTarget(target.targetKey, entry.name, signal)
      } catch (error: unknown) {
        throw mapIoError(error, childDisplayPath, "list")
      }
      let childInfo: PathInfo | null
      try {
        childInfo = await pathProbe(childTarget.targetKey, false)
      } catch (error: unknown) {
        throw mapIoError(error, childDisplayPath, "list")
      }
      result.push({
        name: entry.name,
        type: childInfo?.type ?? "other",
        target: { displayPath: childDisplayPath, targetKey: childTarget.targetKey },
        ...(childInfo ? { version: childInfo.version } : {}),
        ...(childInfo?.type === "file" ? { size: childInfo.size } : {}),
      })
    }
    return result
  }

  async writeText(
    target: FileTarget,
    content: string,
    expected?: FileWriteIntent,
    signal?: AbortSignal,
  ): Promise<FileWriteOutcome> {
    throwIfAborted(signal, "write")
    return this.withLock(target.targetKey, signal, async () => {
      let existing: PathInfo | null
      try {
        existing = await pathProbe(target.targetKey)
      } catch (error: unknown) {
        throw mapWriteError(error, target.displayPath)
      }
      if (existing && existing.type !== "file") {
        throw new FileSystemError(`cannot write "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE")
      }
      if (expected?.kind === "replaceIfVersion") {
        if (!existing || existing.version !== expected.version) {
          throw new FileSystemError(
            `cannot write "${target.displayPath}": file changed since it was read`,
            "FS_STALE_VERSION",
          )
        }
      }
      if (expected?.kind === "createIfAbsent" && existing) {
        throw new FileSystemError(
          `cannot overwrite existing "${target.displayPath}" without reading it first`,
          "FS_NOT_OBSERVED",
        )
      }

      const before = existing ? await readWriteBasis(target, signal) : null
      if (expected?.kind === "replaceIfVersion") {
        const current = await pathProbe(target.targetKey)
        if (current?.type !== "file" || current.version !== expected.version) {
          throw new FileSystemError(
            `cannot write "${target.displayPath}": file changed since it was read`,
            "FS_STALE_VERSION",
          )
        }
      }
      if (expected?.kind === "createIfAbsent" && (await pathProbe(target.targetKey))) {
        throw new FileSystemError(
          `cannot overwrite existing "${target.displayPath}" without reading it first`,
          "FS_NOT_OBSERVED",
        )
      }

      await writeFileAtomic(target, content, signal, expected?.kind === "createIfAbsent")
      let version: FileVersion
      try {
        version = await versionAfterWrite(target)
      } catch (error: unknown) {
        throw mapWriteError(error, target.displayPath)
      }
      return {
        operation: existing ? "update" : "create",
        version,
        before,
        after: normalizeLineEndings(content),
      }
    })
  }

  async editText(
    target: FileTarget,
    edit: FileEditRequest,
    expected?: { readonly version: FileVersion },
    signal?: AbortSignal,
  ): Promise<FileEditOutcome> {
    throwIfAborted(signal, "edit")
    return this.withLock(target.targetKey, signal, async () => {
      let existing: PathInfo | null
      try {
        existing = await pathProbe(target.targetKey)
      } catch (error: unknown) {
        throw mapIoError(error, target.displayPath, "edit")
      }
      if (!existing)
        throw new FileSystemError(
          `cannot edit "${target.displayPath}": file changed since it was read`,
          "FS_STALE_VERSION",
        )
      if (existing.type !== "file") {
        throw new FileSystemError(`cannot edit "${target.displayPath}": not a regular file`, "FS_NOT_REGULAR_FILE")
      }
      if (expected && existing.version !== expected.version) {
        throw new FileSystemError(
          `cannot edit "${target.displayPath}": file changed since it was read`,
          "FS_STALE_VERSION",
        )
      }

      const original = await readEditContent(target, signal)
      const edited = fileTextReplacementApply(
        original.content,
        edit.oldString,
        edit.newString,
        edit.replaceAll,
        target.displayPath,
      )
      const storageContent = `${original.hasBom ? "\uFEFF" : ""}${restoreLineEndings(edited.content, original.lineEndings)}`
      if (expected) {
        const current = await pathProbe(target.targetKey)
        if (current?.type !== "file" || current.version !== expected.version) {
          throw new FileSystemError(
            `cannot edit "${target.displayPath}": file changed since it was read`,
            "FS_STALE_VERSION",
          )
        }
      }
      await writeFileAtomic(target, storageContent, signal, false)
      let version: FileVersion
      try {
        version = await versionAfterWrite(target)
      } catch (error: unknown) {
        throw mapIoError(error, target.displayPath, "edit")
      }
      return { version, before: original.content, after: edited.content }
    })
  }
}

export function fileSystemLocalCreate(options: { readonly cwd: string }): FileSystem {
  return new LocalFileSystem(options.cwd)
}
