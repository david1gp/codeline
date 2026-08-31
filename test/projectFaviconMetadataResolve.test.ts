import { afterEach, beforeEach, expect, test } from "bun:test"
import * as nodeFs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { projectFaviconMetadataResolve } from "../src/project/projectFaviconMetadataResolve.js"

let projectRoot = ""

beforeEach(async () => {
  projectRoot = await nodeFs.mkdtemp(path.join(os.tmpdir(), "codeline-project-favicon-"))
  await nodeFs.mkdir(path.join(projectRoot, "public"))
})

afterEach(async () => {
  await nodeFs.rm(projectRoot, { force: true, recursive: true })
})

test("resolves a readable regular favicon with stable metadata and revision", async () => {
  const faviconPath = path.join(projectRoot, "public", "favicon.ico")
  await nodeFs.writeFile(faviconPath, Buffer.from([0, 1, 2, 3]))

  const first = await projectFaviconMetadataResolve(projectRoot)
  const second = await projectFaviconMetadataResolve(projectRoot)

  expect(first.success).toBe(true)
  expect(second).toEqual(first)
  if (!first.success || first.data === null) throw new Error("Expected favicon metadata")
  expect(first.data).toMatchObject({ path: faviconPath, size: 4, modifiedAt: expect.any(Date) })
  expect(first.data.revision).toEqual(expect.any(String))
})

test("caches an absent favicon until the entry expires", async () => {
  let currentTime = 1_000
  const now = () => currentTime

  const absent = await projectFaviconMetadataResolve(projectRoot, { now })
  expect(absent).toEqual({ success: true, data: null })

  await nodeFs.writeFile(path.join(projectRoot, "public", "favicon.ico"), "icon")
  const cachedAbsent = await projectFaviconMetadataResolve(projectRoot, { now })
  expect(cachedAbsent).toEqual(absent)

  currentTime += 24 * 60 * 60 * 1_000
  const present = await projectFaviconMetadataResolve(projectRoot, { now })
  expect(present.success).toBe(true)
  if (!present.success) throw new Error("Expected favicon metadata after cache expiry")
  expect(present.data).not.toBeNull()
})

test("observes a replacement after the cached metadata expires", async () => {
  let currentTime = 2_000
  const now = () => currentTime
  const faviconPath = path.join(projectRoot, "public", "favicon.ico")
  await nodeFs.writeFile(faviconPath, "first")

  const before = await projectFaviconMetadataResolve(projectRoot, { now })
  if (!before.success || before.data === null) throw new Error("Expected initial favicon metadata")

  await nodeFs.writeFile(faviconPath, "replaced")
  const cached = await projectFaviconMetadataResolve(projectRoot, { now })
  expect(cached).toEqual(before)

  currentTime += 24 * 60 * 60 * 1_000 + 1
  const after = await projectFaviconMetadataResolve(projectRoot, { now })
  expect(after.success).toBe(true)
  if (!after.success || after.data === null) throw new Error("Expected replacement favicon metadata")
  expect(after.data.size).not.toBe(before.data.size)
  expect(after.data.revision).not.toBe(before.data.revision)
})

test("observes removal after the cached metadata expires", async () => {
  let currentTime = 3_000
  const now = () => currentTime
  const faviconPath = path.join(projectRoot, "public", "favicon.ico")
  await nodeFs.writeFile(faviconPath, "icon")

  const present = await projectFaviconMetadataResolve(projectRoot, { now })
  expect(present.success).toBe(true)
  await nodeFs.unlink(faviconPath)

  const cached = await projectFaviconMetadataResolve(projectRoot, { now })
  expect(cached).toEqual(present)

  currentTime += 24 * 60 * 60 * 1_000 + 1
  expect(await projectFaviconMetadataResolve(projectRoot, { now })).toEqual({ success: true, data: null })
})

test("treats invalid favicon entries as absent", async () => {
  const faviconPath = path.join(projectRoot, "public", "favicon.ico")
  let currentTime = 4_000
  const now = () => currentTime
  await nodeFs.mkdir(faviconPath)
  expect(await projectFaviconMetadataResolve(projectRoot, { now })).toEqual({ success: true, data: null })

  await nodeFs.rm(faviconPath, { force: true, recursive: true })
  await nodeFs.writeFile(path.join(projectRoot, "outside.ico"), "outside")
  await nodeFs.symlink(path.join(projectRoot, "outside.ico"), faviconPath)
  currentTime += 24 * 60 * 60 * 1_000 + 1
  expect(await projectFaviconMetadataResolve(projectRoot, { now })).toEqual({ success: true, data: null })
})
