import { afterEach, beforeEach, expect, test } from "bun:test"
import * as nodeFs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { fileSystemLocalCreate } from "../src/tools/filesystem/fileSystemLocalCreate.js"

let projectRoot = ""
let fileSystem: ReturnType<typeof fileSystemLocalCreate>

beforeEach(async () => {
  projectRoot = await nodeFs.mkdtemp(path.join(os.tmpdir(), "codeline-file-system-"))
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

async function textStreamCollect(filePath: string): Promise<string> {
  const target = await fileSystem.resolve(filePath)
  const stream = await fileSystem.streamText(target)
  let content = ""
  for await (const chunk of stream) content += chunk
  return content
}

test("normalizes relative, absolute, and home-directory paths", async () => {
  await nodeFs.mkdir(path.join(projectRoot, "nested"))
  await nodeFs.writeFile(path.join(projectRoot, "file.txt"), "text")

  const relative = await fileSystem.resolve("nested/../file.txt")
  expect(relative.displayPath).toBe(path.join(projectRoot, "file.txt"))

  const absolute = await fileSystem.resolve(path.join(projectRoot, "file.txt"), { cwd: "/does-not-exist" })
  expect(absolute.displayPath).toBe(path.join(projectRoot, "file.txt"))
  expect(absolute.targetKey).toBe(relative.targetKey)

  const home = await fileSystem.resolve("~")
  expect(home.displayPath).toBe(os.homedir())
})

test("honors pre-aborted and in-flight resolution signals", async () => {
  await expect(fileSystem.resolve("missing.txt", { signal: AbortSignal.abort() })).rejects.toMatchObject({
    code: "FS_ABORTED",
  })

  const controller = new AbortController()
  const pending = fileSystem.resolve("also-missing.txt", { signal: controller.signal })
  controller.abort()
  await expect(pending).rejects.toMatchObject({ code: "FS_ABORTED" })
})

test("reports file, directory, and missing metadata with opaque versions", async () => {
  await nodeFs.writeFile(path.join(projectRoot, "file.txt"), "hello")
  await nodeFs.mkdir(path.join(projectRoot, "directory"))

  const fileInfo = await fileSystem.stat(await fileSystem.resolve("file.txt"))
  expect(fileInfo).toMatchObject({ size: 5, type: "file" })
  expect(typeof fileInfo?.version).toBe("string")
  expect((await fileSystem.stat(await fileSystem.resolve("directory")))?.type).toBe("directory")
  expect(await fileSystem.stat(await fileSystem.resolve("missing.txt"))).toBeUndefined()
})

test("changes a version after an external same-size rewrite", async () => {
  const filePath = path.join(projectRoot, "same-size.txt")
  await nodeFs.writeFile(filePath, "first")
  const before = await fileVersionRead(filePath)

  await nodeFs.writeFile(filePath, "other")

  const after = await fileVersionRead(filePath)
  expect(after).not.toBe(before)
})

test("reads and streams UTF-8 text, rejecting missing, directory, binary, and invalid data", async () => {
  await nodeFs.writeFile(path.join(projectRoot, "text.txt"), "one\ntwo\nthree")
  const target = await fileSystem.resolve("text.txt")
  expect(await fileSystem.readText(target)).toBe("one\ntwo\nthree")
  expect(await textStreamCollect("text.txt")).toBe("one\ntwo\nthree")

  await expect(fileSystem.readText(await fileSystem.resolve("missing.txt"))).rejects.toMatchObject({
    code: "FS_NOT_FOUND",
  })
  await expect(fileSystem.readText(await fileSystem.resolve("."))).rejects.toMatchObject({
    code: "FS_NOT_REGULAR_FILE",
  })

  await nodeFs.writeFile(path.join(projectRoot, "binary.bin"), Buffer.from([0x68, 0x00, 0x69]))
  await expect(fileSystem.readText(await fileSystem.resolve("binary.bin"))).rejects.toMatchObject({
    code: "FS_NOT_TEXT",
  })
  await nodeFs.writeFile(path.join(projectRoot, "invalid.bin"), Buffer.from([0x68, 0xff, 0x69]))
  await expect(textStreamCollect("invalid.bin")).rejects.toMatchObject({ code: "FS_NOT_TEXT" })
})

test("reads raw bytes up to the inclusive bound", async () => {
  const bytes = Buffer.from([0x68, 0x00, 0x69, 0xff])
  await nodeFs.writeFile(path.join(projectRoot, "bytes.bin"), bytes)
  const target = await fileSystem.resolve("bytes.bin")

  expect(Buffer.from(await fileSystem.readBytes(target, undefined, bytes.length))).toEqual(bytes)
  await expect(fileSystem.readBytes(target, undefined, bytes.length - 1)).rejects.toMatchObject({
    code: "FS_TOO_LARGE",
  })
})

test("rejects pre-aborted reads", async () => {
  await nodeFs.writeFile(path.join(projectRoot, "text.txt"), "text")
  const target = await fileSystem.resolve("text.txt")

  await expect(fileSystem.readText(target, AbortSignal.abort())).rejects.toMatchObject({ code: "FS_ABORTED" })
  await expect(fileSystem.readBytes(target, AbortSignal.abort(), 100)).rejects.toMatchObject({ code: "FS_ABORTED" })
})

test("creates atomically and reports normalized outcome content and a new version", async () => {
  const target = await fileSystem.resolve("nested/new.txt")
  const outcome = await fileSystem.writeText(target, "one\r\ntwo\r\n", { kind: "createIfAbsent" })

  expect(outcome.operation).toBe("create")
  expect(outcome.before).toBeNull()
  expect(outcome.after).toBe("one\ntwo\n")
  expect(typeof outcome.version).toBe("string")
  expect(await nodeFs.readFile(path.join(projectRoot, "nested/new.txt"), "utf8")).toBe("one\r\ntwo\r\n")
  expect((await nodeFs.readdir(path.join(projectRoot, "nested"))).filter((name) => name.includes(".tmp"))).toEqual([])
})

test("protects an existing file when createIfAbsent collides", async () => {
  const filePath = path.join(projectRoot, "existing.txt")
  await nodeFs.writeFile(filePath, "old")
  const target = await fileSystem.resolve("existing.txt")

  await expect(fileSystem.writeText(target, "new", { kind: "createIfAbsent" })).rejects.toMatchObject({
    code: "FS_NOT_OBSERVED",
  })
  expect(await nodeFs.readFile(filePath, "utf8")).toBe("old")
})

test("replaces only a matching version and returns the post-write version", async () => {
  const filePath = path.join(projectRoot, "guarded.txt")
  await nodeFs.writeFile(filePath, "old")
  const target = await fileSystem.resolve("guarded.txt")
  const before = await fileVersionRead("guarded.txt")

  const outcome = await fileSystem.writeText(target, "new", { kind: "replaceIfVersion", version: before })

  expect(outcome.operation).toBe("update")
  expect(outcome.before).toBe("old")
  expect(outcome.after).toBe("new")
  expect(outcome.version).not.toBe(before)
  expect(outcome.version).toBe(await fileVersionRead("guarded.txt"))
})

test("rejects stale and deleted guarded-write targets without publication", async () => {
  const filePath = path.join(projectRoot, "guarded.txt")
  await nodeFs.writeFile(filePath, "v1")
  const target = await fileSystem.resolve("guarded.txt")
  const stale = await fileVersionRead("guarded.txt")

  await nodeFs.writeFile(filePath, "changed")
  await expect(fileSystem.writeText(target, "v2", { kind: "replaceIfVersion", version: stale })).rejects.toMatchObject({
    code: "FS_STALE_VERSION",
  })
  expect(await nodeFs.readFile(filePath, "utf8")).toBe("changed")

  await nodeFs.unlink(filePath)
  await expect(fileSystem.writeText(target, "v3", { kind: "replaceIfVersion", version: stale })).rejects.toMatchObject({
    code: "FS_STALE_VERSION",
  })
  await expect(nodeFs.stat(filePath)).rejects.toMatchObject({ code: "ENOENT" })
})

test("does not publish an aborted write or write over a directory", async () => {
  const abortedTarget = await fileSystem.resolve("aborted.txt")
  await expect(fileSystem.writeText(abortedTarget, "never", undefined, AbortSignal.abort())).rejects.toMatchObject({
    code: "FS_ABORTED",
  })
  await expect(nodeFs.stat(path.join(projectRoot, "aborted.txt"))).rejects.toMatchObject({ code: "ENOENT" })

  const directoryTarget = await fileSystem.resolve(".")
  await expect(
    fileSystem.writeText(directoryTarget, "not a directory", { kind: "createIfAbsent" }),
  ).rejects.toMatchObject({
    code: "FS_NOT_REGULAR_FILE",
  })
})

test("serializes concurrent guarded writes so one publishes and one becomes stale", async () => {
  await nodeFs.writeFile(path.join(projectRoot, "race.txt"), "base")
  const target = await fileSystem.resolve("race.txt")
  const version = await fileVersionRead("race.txt")

  const results = await Promise.allSettled([
    fileSystem.writeText(target, "one", { kind: "replaceIfVersion", version }),
    fileSystem.writeText(target, "two", { kind: "replaceIfVersion", version }),
  ])

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1)
  const rejected = results.find((result) => result.status === "rejected")
  expect(rejected).toMatchObject({ reason: { code: "FS_STALE_VERSION" } })
  expect(["one", "two"]).toContain(await nodeFs.readFile(path.join(projectRoot, "race.txt"), "utf8"))
})
