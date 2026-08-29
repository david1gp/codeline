import { expect, test } from "bun:test"
import * as nodePath from "node:path"
import * as v from "valibot"
import type { ReadExecute } from "../src/tools/actions/readExecute.js"
import * as readExecuteModule from "../src/tools/actions/readExecute.js"
import { FileSystem } from "../src/tools/filesystem/fileSystem.js"
import { FileSystemError } from "../src/tools/filesystem/fileSystemError.js"
import { type FileTarget, fileTargetKey } from "../src/tools/filesystem/fileTarget.js"
import { fileVersion } from "../src/tools/filesystem/fileVersion.js"
import { readToolOutputSchema } from "../src/tools/schema/readToolOutputSchema.js"

const readExecute = (readExecuteModule as unknown as { readExecute: ReadExecute }).readExecute

class ReadFileSystemFake extends FileSystem {
  readonly files = new Map<string, string>()
  readonly statCalls: string[] = []
  readonly resolveCalls: Array<{ path: string; cwd?: string }> = []
  directoryPaths = new Set<string>()
  binaryPaths = new Set<string>()

  resolve(path: string, options?: { cwd?: string; signal?: AbortSignal }): Promise<FileTarget> {
    if (options?.signal?.aborted) return Promise.reject(new FileSystemError("The operation was aborted.", "FS_ABORTED"))
    const cwd = options?.cwd ?? "/workspace"
    this.resolveCalls.push({ path, cwd })
    const displayPath = nodePath.resolve(cwd, path)
    return Promise.resolve({ displayPath, targetKey: fileTargetKey(displayPath) })
  }

  processPath(target: FileTarget): string {
    return target.displayPath
  }

  fileUrl(target: FileTarget): string {
    return `file://${target.displayPath}`
  }

  contains(parent: FileTarget, child: FileTarget): boolean {
    return child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`)
  }

  stat(target: FileTarget, signal?: AbortSignal) {
    this.statCalls.push(target.displayPath)
    if (signal?.aborted) return Promise.reject(new FileSystemError("The operation was aborted.", "FS_ABORTED"))
    if (this.directoryPaths.has(target.displayPath))
      return Promise.resolve({ type: "directory" as const, version: fileVersion("directory-v1") })
    if (this.binaryPaths.has(target.displayPath))
      return Promise.resolve({ type: "file" as const, size: 3, version: fileVersion("binary-v1") })
    const content = this.files.get(target.displayPath)
    if (content === undefined) return Promise.resolve(undefined)
    return Promise.resolve({ type: "file" as const, size: Buffer.byteLength(content), version: fileVersion("file-v1") })
  }

  lstat(): never {
    throw new Error("not used by read")
  }

  readText(target: FileTarget, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return Promise.reject(new FileSystemError("The operation was aborted.", "FS_ABORTED"))
    if (this.binaryPaths.has(target.displayPath))
      return Promise.reject(new FileSystemError("The file is not UTF-8 text.", "FS_NOT_TEXT"))
    const content = this.files.get(target.displayPath)
    if (content === undefined) return Promise.reject(new FileSystemError("The file was not found.", "FS_NOT_FOUND"))
    return Promise.resolve(content)
  }

  streamText(target: FileTarget, signal?: AbortSignal): Promise<AsyncIterable<string>> {
    if (signal?.aborted) return Promise.reject(new FileSystemError("The operation was aborted.", "FS_ABORTED"))
    if (this.binaryPaths.has(target.displayPath))
      return Promise.reject(new FileSystemError("The file is not UTF-8 text.", "FS_NOT_TEXT"))
    const content = this.files.get(target.displayPath)
    if (content === undefined) return Promise.reject(new FileSystemError("The file was not found.", "FS_NOT_FOUND"))
    return Promise.resolve(
      (async function* (): AsyncIterable<string> {
        for (let index = 0; index < content.length; index += 3) yield content.slice(index, index + 3)
      })(),
    )
  }

  readBytes(): never {
    throw new Error("not used by read")
  }

  listDir(): never {
    throw new Error("not used by read")
  }

  writeText(): never {
    throw new Error("not used by read")
  }

  editText(): never {
    throw new Error("not used by read")
  }
}

function readOptions(fileSystem: FileSystem, signal = new AbortController().signal) {
  return { fileSystem, outputLimit: 4_096, projectRoot: "/workspace", signal, timeoutMs: null }
}

test("read returns a normalized, line-numbered bounded window", async () => {
  const fileSystem = new ReadFileSystemFake()
  fileSystem.files.set("/workspace/notes.txt", "one\ntwo\nthree\nfour")

  const result = await readExecute({ file_path: "nested/../notes.txt", offset: 2, limit: 2 }, readOptions(fileSystem))

  expect(result).toEqual({
    success: true,
    data: {
      lines: [
        { number: 2, text: "two" },
        { number: 3, text: "three" },
      ],
      offset: 2,
      path: "/workspace/notes.txt",
      totalLines: 4,
      version: "file-v1",
    },
  })
  if (result.success) expect(v.safeParse(readToolOutputSchema, result.data).success).toBe(true)
  expect(fileSystem.resolveCalls[0]).toMatchObject({ cwd: "/workspace" })
  expect(fileSystem.statCalls).toHaveLength(1)
})

test("read keeps a large streamed source bounded by the requested line window", async () => {
  const fileSystem = new ReadFileSystemFake()
  fileSystem.files.set(
    "/workspace/large.txt",
    Array.from({ length: 2_500 }, (_, index) => `line ${index + 1}`).join("\n"),
  )

  const result = await readExecute({ file_path: "large.txt", limit: 2 }, readOptions(fileSystem))

  expect(result).toMatchObject({ success: true, data: { offset: 1, totalLines: 2_500 } })
  if (!result.success) return
  expect(result.data.lines).toEqual([
    { number: 1, text: "line 1" },
    { number: 2, text: "line 2" },
  ])
  expect(result.data.lines.length).toBeLessThanOrEqual(2)
})

test("read keeps a long selected line within the action output limit", async () => {
  const fileSystem = new ReadFileSystemFake()
  fileSystem.files.set("/workspace/long.txt", "x".repeat(10_000))

  const result = await readExecute({ file_path: "long.txt" }, { ...readOptions(fileSystem), outputLimit: 1_024 })

  expect(result).toMatchObject({ success: true })
  if (result.success) expect(JSON.stringify(result.data).length).toBeLessThanOrEqual(1_024)
})

test("read rejects an offset past EOF as a structured not-found result", async () => {
  const fileSystem = new ReadFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "one\ntwo")

  const result = await readExecute({ file_path: "file.txt", offset: 9, limit: 1 }, readOptions(fileSystem))

  expect(result).toMatchObject({ success: false, code: "FS_NOT_FOUND" })
})

test("read handles empty files, CRLF, and a final line without a newline", async () => {
  const fileSystem = new ReadFileSystemFake()
  fileSystem.files.set("/workspace/empty.txt", "")
  fileSystem.files.set("/workspace/crlf.txt", "one\r\ntwo\r\nthree")

  const empty = await readExecute({ file_path: "empty.txt" }, readOptions(fileSystem))
  const crlf = await readExecute({ file_path: "crlf.txt" }, readOptions(fileSystem))

  expect(empty).toMatchObject({ success: true, data: { lines: [], totalLines: 0, version: "file-v1" } })
  expect(crlf).toMatchObject({
    success: true,
    data: {
      lines: [
        { number: 1, text: "one" },
        { number: 2, text: "two" },
        { number: 3, text: "three" },
      ],
      totalLines: 3,
    },
  })
})

test("read reports structured errors for missing, non-text, and non-regular targets", async () => {
  const fileSystem = new ReadFileSystemFake()
  fileSystem.binaryPaths.add("/workspace/binary.bin")
  fileSystem.directoryPaths.add("/workspace/directory")

  for (const [input, code] of [
    [{ file_path: "missing.txt" }, "FS_NOT_FOUND"],
    [{ file_path: "binary.bin" }, "FS_NOT_TEXT"],
    [{ file_path: "directory" }, "FS_NOT_REGULAR_FILE"],
  ] as const) {
    const result = await readExecute(input, readOptions(fileSystem))
    expect(result).toMatchObject({ success: false, code })
  }
})

test("read rejects an aborted execution without reading or streaming", async () => {
  const fileSystem = new ReadFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "text")
  const signal = AbortSignal.abort()

  const result = await readExecute({ file_path: "file.txt" }, readOptions(fileSystem, signal))

  expect(result).toMatchObject({ success: false, code: "FS_ABORTED", errorMessage: expect.any(String) })
  expect(fileSystem.statCalls).toHaveLength(0)
})
