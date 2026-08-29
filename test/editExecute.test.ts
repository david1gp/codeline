import { expect, test } from "bun:test"
import * as v from "valibot"
import type { EditExecute } from "../src/tools/actions/editExecute.js"
import * as editExecuteModule from "../src/tools/actions/editExecute.js"
import { FileSystem } from "../src/tools/filesystem/fileSystem.js"
import { FileSystemError } from "../src/tools/filesystem/fileSystemError.js"
import { type FileTarget, fileTargetKey } from "../src/tools/filesystem/fileTarget.js"
import { fileVersion } from "../src/tools/filesystem/fileVersion.js"
import { editToolOutputSchema } from "../src/tools/schema/editToolOutputSchema.js"

const editExecute = (editExecuteModule as unknown as { editExecute: EditExecute }).editExecute

class EditFileSystemFake extends FileSystem {
  readonly files = new Map<string, string>()
  readonly intents: Array<unknown> = []
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

  stat(target: FileTarget) {
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
    throw new Error("not used by edit")
  }
  readText(): never {
    throw new Error("not used by edit")
  }
  streamText(): never {
    throw new Error("not used by edit")
  }
  readBytes(): never {
    throw new Error("not used by edit")
  }
  listDir(): never {
    throw new Error("not used by edit")
  }
  writeText(): never {
    throw new Error("not used by edit")
  }

  editText(
    target: FileTarget,
    edit: { oldString: string; newString: string; replaceAll: boolean },
    expected?: unknown,
    signal?: AbortSignal,
  ) {
    this.intents.push(expected)
    if (signal?.aborted) return Promise.reject(new FileSystemError("The operation was aborted.", "FS_ABORTED"))
    if (this.rejectWith) return Promise.reject(this.rejectWith)
    const before = this.files.get(target.displayPath)
    if (before === undefined) return Promise.reject(new FileSystemError("The file was not found.", "FS_NOT_FOUND"))
    if (edit.oldString === edit.newString)
      return Promise.reject(new FileSystemError("The replacement is a no-op.", "FS_EDIT_NOT_FOUND"))
    const matches = before.split(edit.oldString).length - 1
    if (matches === 0) return Promise.reject(new FileSystemError("The text was not found.", "FS_EDIT_NOT_FOUND"))
    if (matches > 1 && !edit.replaceAll)
      return Promise.reject(new FileSystemError("The text matched more than once.", "FS_AMBIGUOUS_EDIT"))
    const after = edit.replaceAll
      ? before.split(edit.oldString).join(edit.newString)
      : before.replace(edit.oldString, edit.newString)
    this.files.set(target.displayPath, after)
    return Promise.resolve({ version: fileVersion("version-2"), before, after })
  }
}

function editOptions(fileSystem: FileSystem, signal = new AbortController().signal) {
  return { fileSystem, outputLimit: 4_096, projectRoot: "/workspace", signal, timeoutMs: null }
}

test("edit applies one exact replacement and returns the current content", async () => {
  const fileSystem = new EditFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "one two")

  const result = await editExecute(
    { file_path: "file.txt", old_string: "two", new_string: "THREE" },
    editOptions(fileSystem),
  )

  expect(result).toEqual({
    success: true,
    data: { after: "one THREE", before: "one two", path: "/workspace/file.txt" },
  })
  if (result.success) expect(v.safeParse(editToolOutputSchema, result.data).success).toBe(true)
  expect(fileSystem.intents).toEqual([{ version: fileVersion("version-1") }])
})

test("edit replaces all exact matches only when requested", async () => {
  const fileSystem = new EditFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "a a a")

  const result = await editExecute(
    { file_path: "file.txt", old_string: "a", new_string: "b", replace_all: true },
    editOptions(fileSystem),
  )

  expect(result).toMatchObject({ success: true, data: { before: "a a a", after: "b b b" } })
})

test("edit rejects missing and ambiguous matches atomically", async () => {
  const fileSystem = new EditFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "a a")

  const missing = await editExecute(
    { file_path: "file.txt", old_string: "z", new_string: "x" },
    editOptions(fileSystem),
  )
  const ambiguous = await editExecute(
    { file_path: "file.txt", old_string: "a", new_string: "x" },
    editOptions(fileSystem),
  )

  expect(missing).toMatchObject({ success: false, code: "FS_EDIT_NOT_FOUND" })
  expect(ambiguous).toMatchObject({ success: false, code: "FS_AMBIGUOUS_EDIT" })
  expect(fileSystem.files.get("/workspace/file.txt")).toBe("a a")
})

test("edit rejects an identical replacement as a no-op without publication", async () => {
  const fileSystem = new EditFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "unchanged")

  const result = await editExecute(
    { file_path: "file.txt", old_string: "unchanged", new_string: "unchanged" },
    editOptions(fileSystem),
  )

  expect(result).toMatchObject({ success: false, code: "FS_EDIT_NOT_FOUND" })
  expect(fileSystem.files.get("/workspace/file.txt")).toBe("unchanged")
})

test("edit preserves a UTF-8 BOM and CRLF line endings through an exact replacement", async () => {
  const fileSystem = new EditFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "\uFEFFone\r\nOLD\r\ntwo\r\n")

  const result = await editExecute(
    { file_path: "file.txt", old_string: "OLD", new_string: "NEW" },
    editOptions(fileSystem),
  )

  expect(result).toMatchObject({
    success: true,
    data: { before: "\uFEFFone\r\nOLD\r\ntwo\r\n", after: "\uFEFFone\r\nNEW\r\ntwo\r\n" },
  })
  expect(fileSystem.files.get("/workspace/file.txt")).toBe("\uFEFFone\r\nNEW\r\ntwo\r\n")
})

test("edit reports stale errors without mutating the original file", async () => {
  const fileSystem = new EditFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "keep")
  fileSystem.rejectWith = new FileSystemError("The file changed since it was read.", "FS_STALE_VERSION")

  const result = await editExecute(
    { file_path: "file.txt", old_string: "keep", new_string: "changed" },
    editOptions(fileSystem),
  )

  expect(result).toMatchObject({ success: false, code: "FS_STALE_VERSION" })
  expect(fileSystem.files.get("/workspace/file.txt")).toBe("keep")
})

test("edit rejects an aborted operation before publication", async () => {
  const fileSystem = new EditFileSystemFake()
  fileSystem.files.set("/workspace/file.txt", "keep")

  const result = await editExecute(
    { file_path: "file.txt", old_string: "keep", new_string: "changed" },
    editOptions(fileSystem, AbortSignal.abort()),
  )

  expect(result).toMatchObject({ success: false, code: "FS_ABORTED" })
  expect(fileSystem.files.get("/workspace/file.txt")).toBe("keep")
})

test("edit bounds a large successful result instead of failing after publication", async () => {
  const fileSystem = new EditFileSystemFake()
  fileSystem.files.set("/workspace/large.txt", "x".repeat(10_000))

  const result = await editExecute(
    { file_path: "large.txt", old_string: "x", new_string: "y", replace_all: true },
    { ...editOptions(fileSystem), outputLimit: 256 },
  )

  expect(result).toMatchObject({ success: true })
  if (result.success) expect(JSON.stringify(result.data).length).toBeLessThanOrEqual(256)
  expect(fileSystem.files.get("/workspace/large.txt")).toBe("y".repeat(10_000))
})
