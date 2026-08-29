import { afterEach, beforeEach, expect, test } from "bun:test"
import * as nodeFs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { fileSystemLocalCreate } from "../src/tools/filesystem/fileSystemLocalCreate.js"
import { fileTextReplacementApply } from "../src/tools/filesystem/fileTextReplacementApply.js"

let projectRoot = ""
let fileSystem: ReturnType<typeof fileSystemLocalCreate>

beforeEach(async () => {
  projectRoot = await nodeFs.mkdtemp(path.join(os.tmpdir(), "codeline-file-edit-"))
  fileSystem = fileSystemLocalCreate({ cwd: projectRoot })
})

afterEach(async () => {
  await nodeFs.rm(projectRoot, { force: true, recursive: true })
})

async function fileVersionRead(filePath: string) {
  const target = await fileSystem.resolve(filePath)
  const info = await fileSystem.stat(target)
  expect(info).toBeDefined()
  if (info === undefined) throw new Error(`Expected ${filePath} to exist`)
  return info.version
}

test("applies one unique literal replacement", () => {
  expect(fileTextReplacementApply("a b c", "b", "X", false, "file.txt")).toEqual({
    content: "a X c",
    replacements: 1,
  })
})

test("rejects missing and empty replacement strings", () => {
  expect(() => fileTextReplacementApply("a b c", "z", "X", false, "file.txt")).toThrow(
    expect.objectContaining({ code: "FS_EDIT_NOT_FOUND" }),
  )
  expect(() => fileTextReplacementApply("a b c", "", "X", false, "file.txt")).toThrow(
    expect.objectContaining({ code: "FS_EDIT_NOT_FOUND" }),
  )
})

test("rejects ambiguous matches unless replaceAll is enabled", () => {
  expect(() => fileTextReplacementApply("a a a", "a", "X", false, "file.txt")).toThrow(
    expect.objectContaining({ code: "FS_AMBIGUOUS_EDIT" }),
  )
  expect(fileTextReplacementApply("a a a", "a", "X", true, "file.txt")).toEqual({
    content: "X X X",
    replacements: 3,
  })
})

test("normalizes line endings while matching and replacing literals", () => {
  expect(fileTextReplacementApply("one\ntwo", "one\r\ntwo", "x\r\ny", false, "file.txt")).toEqual({
    content: "x\ny",
    replacements: 1,
  })
})

test("edits CRLF storage through an LF-normalized replacement contract", async () => {
  const filePath = path.join(projectRoot, "crlf.txt")
  await nodeFs.writeFile(filePath, "one\r\nOLD\r\ntwo\r\n")
  const target = await fileSystem.resolve("crlf.txt")

  const outcome = await fileSystem.editText(target, { oldString: "OLD", newString: "NEW", replaceAll: false })

  expect(outcome.before).toBe("one\nOLD\ntwo\n")
  expect(outcome.after).toBe("one\nNEW\ntwo\n")
  expect(await nodeFs.readFile(filePath, "utf8")).toBe("one\r\nNEW\r\ntwo\r\n")
})

test("rejects binary and invalid UTF-8 edits without rewriting the file", async () => {
  const binaryPath = path.join(projectRoot, "binary.bin")
  const binary = Buffer.from([0x00, 0x01])
  await nodeFs.writeFile(binaryPath, binary)
  await expect(
    fileSystem.editText(await fileSystem.resolve("binary.bin"), {
      oldString: "x",
      newString: "y",
      replaceAll: false,
    }),
  ).rejects.toMatchObject({ code: "FS_NOT_TEXT" })
  expect(await nodeFs.readFile(binaryPath)).toEqual(binary)

  const invalidPath = path.join(projectRoot, "invalid.bin")
  const invalid = Buffer.from([0x68, 0xff, 0x69])
  await nodeFs.writeFile(invalidPath, invalid)
  await expect(
    fileSystem.editText(await fileSystem.resolve("invalid.bin"), {
      oldString: "h",
      newString: "H",
      replaceAll: false,
    }),
  ).rejects.toMatchObject({ code: "FS_NOT_TEXT" })
  expect(await nodeFs.readFile(invalidPath)).toEqual(invalid)
})

test("checks a supplied version before matching and reports missing targets as stale", async () => {
  const filePath = path.join(projectRoot, "stale.txt")
  await nodeFs.writeFile(filePath, "hello world")
  const target = await fileSystem.resolve("stale.txt")
  const stale = await fileVersionRead("stale.txt")
  await nodeFs.writeFile(filePath, "goodbye")

  await expect(
    fileSystem.editText(target, { oldString: "world", newString: "there", replaceAll: false }, { version: stale }),
  ).rejects.toMatchObject({ code: "FS_STALE_VERSION" })

  await nodeFs.unlink(filePath)
  await expect(
    fileSystem.editText(target, { oldString: "goodbye", newString: "bye", replaceAll: false }, { version: stale }),
  ).rejects.toMatchObject({ code: "FS_STALE_VERSION" })
})

test("reports missing and ambiguous matches at the current version", async () => {
  await nodeFs.writeFile(path.join(projectRoot, "conflicts.txt"), "a a a")
  const target = await fileSystem.resolve("conflicts.txt")
  const version = await fileVersionRead("conflicts.txt")

  await expect(
    fileSystem.editText(target, { oldString: "z", newString: "X", replaceAll: false }, { version }),
  ).rejects.toMatchObject({ code: "FS_EDIT_NOT_FOUND" })
  await expect(
    fileSystem.editText(target, { oldString: "a", newString: "X", replaceAll: false }, { version }),
  ).rejects.toMatchObject({ code: "FS_AMBIGUOUS_EDIT" })
})

test("replaces all matches and refreshes the returned version for a follow-up edit", async () => {
  await nodeFs.writeFile(path.join(projectRoot, "follow-up.txt"), "one one two")
  const target = await fileSystem.resolve("follow-up.txt")

  const first = await fileSystem.editText(
    target,
    { oldString: "one", newString: "ONE", replaceAll: true },
    { version: await fileVersionRead("follow-up.txt") },
  )
  const second = await fileSystem.editText(
    target,
    { oldString: "two", newString: "TWO", replaceAll: false },
    { version: first.version },
  )

  expect(first.after).toBe("ONE ONE two")
  expect(second.after).toBe("ONE ONE TWO")
  expect(await nodeFs.readFile(path.join(projectRoot, "follow-up.txt"), "utf8")).toBe("ONE ONE TWO")
})

test("does not publish an aborted edit", async () => {
  const filePath = path.join(projectRoot, "aborted.txt")
  await nodeFs.writeFile(filePath, "keep")
  const target = await fileSystem.resolve("aborted.txt")

  await expect(
    fileSystem.editText(
      target,
      { oldString: "keep", newString: "changed", replaceAll: false },
      undefined,
      AbortSignal.abort(),
    ),
  ).rejects.toMatchObject({ code: "FS_ABORTED" })
  expect(await nodeFs.readFile(filePath, "utf8")).toBe("keep")
})

test("serializes concurrent edits and write-versus-edit conflicts at one version", async () => {
  await nodeFs.writeFile(path.join(projectRoot, "race.txt"), "base")
  const target = await fileSystem.resolve("race.txt")
  const version = await fileVersionRead("race.txt")

  const editResults = await Promise.allSettled([
    fileSystem.editText(target, { oldString: "base", newString: "one", replaceAll: false }, { version }),
    fileSystem.editText(target, { oldString: "base", newString: "two", replaceAll: false }, { version }),
  ])
  expect(editResults.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  expect(editResults.find((result) => result.status === "rejected")).toMatchObject({
    reason: { code: "FS_STALE_VERSION" },
  })

  await nodeFs.writeFile(path.join(projectRoot, "write-edit.txt"), "base")
  const writeEditTarget = await fileSystem.resolve("write-edit.txt")
  const writeEditVersion = await fileVersionRead("write-edit.txt")
  const mixedResults = await Promise.allSettled([
    fileSystem.writeText(writeEditTarget, "written", { kind: "replaceIfVersion", version: writeEditVersion }),
    fileSystem.editText(
      writeEditTarget,
      { oldString: "base", newString: "edited", replaceAll: false },
      { version: writeEditVersion },
    ),
  ])
  expect(mixedResults.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  expect(mixedResults.find((result) => result.status === "rejected")).toMatchObject({
    reason: { code: "FS_STALE_VERSION" },
  })
})
