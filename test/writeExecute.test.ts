import { expect, test } from "bun:test"
import * as v from "valibot"
import type { WriteExecute } from "../src/tools/actions/writeExecute.js"
import * as writeExecuteModule from "../src/tools/actions/writeExecute.js"
import { FileSystem } from "../src/tools/filesystem/fileSystem.js"
import { FileSystemError } from "../src/tools/filesystem/fileSystemError.js"
import { type FileTarget, fileTargetKey } from "../src/tools/filesystem/fileTarget.js"
import { fileVersion } from "../src/tools/filesystem/fileVersion.js"
import { writeToolOutputSchema } from "../src/tools/schema/writeToolOutputSchema.js"

const writeExecute = (writeExecuteModule as unknown as { writeExecute: WriteExecute }).writeExecute

class WriteFileSystemFake extends FileSystem {
  readonly files = new Map<string, string>()
  readonly intents: Array<unknown> = []
  readonly writes: string[] = []
  rejectWith: FileSystemError | undefined

  resolve(path: string, options?: { cwd?: string }): Promise<FileTarget> {
    const displayPath = path.startsWith("/") ? path : `${options?.cwd ?? "/workspace"}/${path}`
    return Promise.resolve({ displayPath, targetKey: fileTargetKey(displayPath) })
  }

  processPath(target: FileTarget): string {
    return target.displayPath
  }
  fileUrl(target: FileTarget): string {
    return `file://${target.displayPath}`
  }
  contains(parent: FileTarget, child: FileTarget): boolean {
    return child.displayPath.startsWith(parent.displayPath)
  }

  stat(target: FileTarget, signal?: AbortSignal) {
    if (signal?.aborted) return Promise.reject(new FileSystemError("The operation was aborted.", "FS_ABORTED"))
    const content = this.files.get(target.displayPath)
    return Promise.resolve(
      content === undefined
        ? undefined
        : {
            type: "file" as const,
            size: Buffer.byteLength(content),
            version: fileVersion("version-1"),
          },
    )
  }

  lstat(): never {
    throw new Error("not used by write")
  }
  readText(): never {
    throw new Error("not used by write")
  }
  streamText(): never {
    throw new Error("not used by write")
  }
  readBytes(): never {
    throw new Error("not used by write")
  }
  listDir(): never {
    throw new Error("not used by write")
  }

  writeText(target: FileTarget, content: string, expected?: unknown, signal?: AbortSignal) {
    this.intents.push(expected)
    if (signal?.aborted) return Promise.reject(new FileSystemError("The operation was aborted.", "FS_ABORTED"))
    if (this.rejectWith) return Promise.reject(this.rejectWith)
    const before = this.files.get(target.displayPath) ?? null
    if (expected && typeof expected === "object" && "kind" in expected) {
      const intent = expected as { kind: string; version?: unknown }
      if (intent.kind === "createIfAbsent" && before !== null)
        return Promise.reject(new FileSystemError("The file was not observed.", "FS_NOT_OBSERVED"))
      if (intent.kind === "replaceIfVersion" && intent.version !== fileVersion("version-1"))
        return Promise.reject(new FileSystemError("The file is stale.", "FS_STALE_VERSION"))
    }
    this.writes.push(content)
    this.files.set(target.displayPath, content)
    return Promise.resolve({
      operation: before === null ? ("create" as const) : ("update" as const),
      version: fileVersion("version-2"),
      before,
      after: content,
    })
  }

  editText(): never {
    throw new Error("not used by write")
  }
}

function writeOptions(fileSystem: FileSystem, signal = new AbortController().signal) {
  return { fileSystem, outputLimit: 4_096, projectRoot: "/workspace", signal, timeoutMs: null }
}

test("write creates a missing file atomically with exact content", async () => {
  const fileSystem = new WriteFileSystemFake()
  const result = await writeExecute({ file_path: "new.txt", content: "one\ntwo\n" }, writeOptions(fileSystem))

  expect(result).toEqual({
    success: true,
    data: { after: "one\ntwo\n", before: null, operation: "create", path: "/workspace/new.txt" },
  })
  expect(fileSystem.intents).toEqual([{ kind: "createIfAbsent" }])
  if (result.success) expect(v.safeParse(writeToolOutputSchema, result.data).success).toBe(true)
})

test("write replaces an existing file with a version guard and returns normalized outcome", async () => {
  const fileSystem = new WriteFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "old")

  const result = await writeExecute(
    { content: "new", file_path: "file.txt", version: "version-1" },
    writeOptions(fileSystem),
  )

  expect(result).toMatchObject({
    success: true,
    data: { after: "new", before: "old", operation: "update", path: "/workspace/file.txt" },
  })
  if (result.success) expect(v.safeParse(writeToolOutputSchema, result.data).success).toBe(true)
  expect(fileSystem.intents).toEqual([{ kind: "replaceIfVersion", version: "version-1" }])
})

test("write requires the observed version before replacing an existing file", async () => {
  const fileSystem = new WriteFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "old")

  const missingVersion = await writeExecute({ file_path: "file.txt", content: "new" }, writeOptions(fileSystem))
  expect(missingVersion).toMatchObject({ success: false, code: "FS_NOT_OBSERVED" })
  expect(fileSystem.files.get("/workspace/file.txt")).toBe("old")

  const replaced = await writeExecute(
    { content: "new", file_path: "file.txt", version: "version-1" },
    writeOptions(fileSystem),
  )
  expect(replaced).toMatchObject({ success: true, data: { operation: "update" } })
  expect(fileSystem.intents).toEqual([
    { kind: "createIfAbsent" },
    { kind: "replaceIfVersion", version: fileVersion("version-1") },
  ])
})

test("write bounds a large successful result instead of failing after publication", async () => {
  const fileSystem = new WriteFileSystemFake()
  const result = await writeExecute(
    { content: "x".repeat(10_000), file_path: "large.txt" },
    { ...writeOptions(fileSystem), outputLimit: 256 },
  )

  expect(result).toMatchObject({ success: true })
  if (result.success) expect(JSON.stringify(result.data).length).toBeLessThanOrEqual(256)
  expect(fileSystem.files.get("/workspace/large.txt")).toHaveLength(10_000)
})

test("write preserves BOM and requested LF/CRLF bytes", async () => {
  const fileSystem = new WriteFileSystemFake()
  const content = "\uFEFFone\r\ntwo\r\n"

  await writeExecute({ file_path: "encoded.txt", content }, writeOptions(fileSystem))

  expect(fileSystem.files.get("/workspace/encoded.txt")).toBe(content)
  expect(fileSystem.writes).toEqual([content])
})

test("write returns structured stale errors and leaves the target unchanged", async () => {
  const fileSystem = new WriteFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "keep")
  fileSystem.rejectWith = new FileSystemError("The file changed since it was read.", "FS_STALE_VERSION")

  const result = await writeExecute({ file_path: "file.txt", content: "discard" }, writeOptions(fileSystem))

  expect(result).toMatchObject({ success: false, code: "FS_STALE_VERSION" })
  expect(fileSystem.files.get("/workspace/file.txt")).toBe("keep")
  expect(fileSystem.writes).toEqual([])
})

test("write propagates abort before publication", async () => {
  const fileSystem = new WriteFileSystemFake()
  const result = await writeExecute(
    { file_path: "file.txt", content: "never" },
    writeOptions(fileSystem, AbortSignal.abort()),
  )

  expect(result).toMatchObject({ success: false, code: "FS_ABORTED" })
  expect(fileSystem.files).toEqual(new Map())
})
