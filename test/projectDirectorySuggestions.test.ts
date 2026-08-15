import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { projectDirectoryConfirm } from "../src/project/projectDirectoryConfirm.js"
import { projectDirectorySuggestionsRead } from "../src/project/projectDirectorySuggestionsRead.js"

describe("project directory selection", () => {
  let rootsDir: string
  let firstRoot: string
  let secondRoot: string
  let outsideDir: string

  beforeAll(async () => {
    rootsDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-selection-test-"))
    firstRoot = path.join(rootsDir, "first")
    secondRoot = path.join(rootsDir, "second")
    outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "project-selection-outside-"))
    await fs.mkdir(path.join(firstRoot, "Alpha"), { recursive: true })
    await fs.mkdir(path.join(firstRoot, "beta", "nested"), { recursive: true })
    await fs.mkdir(secondRoot)
    await fs.writeFile(path.join(firstRoot, "file.txt"), "not a directory", "utf8")
    await fs.symlink(outsideDir, path.join(firstRoot, "linked"))
  })

  afterAll(async () => {
    await Promise.all([
      fs.rm(rootsDir, { force: true, recursive: true }),
      fs.rm(outsideDir, { force: true, recursive: true }),
    ])
  })

  test("returns bounded directory suggestions from configured roots", async () => {
    const result = await projectDirectorySuggestionsRead([firstRoot, secondRoot], "")

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.map((suggestion) => suggestion.path)).toEqual([
      path.join(firstRoot, "Alpha"),
      path.join(firstRoot, "beta"),
      firstRoot,
      secondRoot,
    ])
    expect(result.data.some((suggestion) => suggestion.path.endsWith("file.txt"))).toBe(false)
    expect(result.data.some((suggestion) => suggestion.path.endsWith("linked"))).toBe(false)
  })

  test("supports nested relative and absolute prefixes without leaving roots", async () => {
    const nested = await projectDirectorySuggestionsRead([firstRoot], "beta/")
    expect(nested).toEqual({
      success: true,
      data: [{ path: path.join(firstRoot, "beta", "nested"), label: "nested" }],
    })

    const outside = await projectDirectorySuggestionsRead([firstRoot], path.join(outsideDir, ""))
    expect(outside).toEqual({ success: true, data: [] })
  })

  test("confirms only canonical real directories within configured roots", async () => {
    await expect(projectDirectoryConfirm(path.join(firstRoot, "Alpha"), [firstRoot])).resolves.toEqual({
      success: true,
      data: { path: path.join(firstRoot, "Alpha"), label: "Alpha" },
    })
    expect((await projectDirectoryConfirm(path.join(firstRoot, "file.txt"), [firstRoot])).success).toBe(false)
    expect((await projectDirectoryConfirm(path.join(firstRoot, "linked"), [firstRoot])).success).toBe(false)
    expect((await projectDirectoryConfirm(outsideDir, [firstRoot])).success).toBe(false)
  })
})
