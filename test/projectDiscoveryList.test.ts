import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as v from "valibot"
import { projectApiListResponseSchema } from "../src/project/api/projectApiListResponseSchema.js"
import { projectDiscoveryLimits } from "../src/project/projectDiscoveryLimits.js"
import { projectDiscoveryList } from "../src/project/projectDiscoveryList.js"
import { projectResolve } from "../src/project/projectResolve.js"

describe("project discovery and resolution", () => {
  let tempDir: string
  let firstRoot: string
  let secondRoot: string

  beforeAll(async () => {
    tempDir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "project-discovery-test-")))
    firstRoot = path.join(tempDir, "first-root")
    secondRoot = path.join(tempDir, "second-root")
    await fs.mkdir(firstRoot)
    await fs.mkdir(secondRoot)
    await fs.mkdir(path.join(firstRoot, "shared"))
    await fs.mkdir(path.join(firstRoot, "unique"))
    await fs.mkdir(path.join(secondRoot, "shared"))
    await fs.mkdir(path.join(secondRoot, "other"))
    await fs.symlink(path.join(firstRoot, "unique"), path.join(firstRoot, "linked-project"))
    await fs.symlink(firstRoot, path.join(tempDir, "linked-root"))
  })

  afterAll(async () => {
    await fs.rm(tempDir, { force: true, recursive: true })
  })

  test("canonicalizes and deduplicates duplicate roots while keeping opaque stable selections", async () => {
    const roots = [firstRoot, path.join(firstRoot, "."), secondRoot, firstRoot]
    const first = await projectDiscoveryList(roots)
    const second = await projectDiscoveryList(roots)

    expect(first.success).toBe(true)
    expect(second).toEqual(first)
    if (!first.success) return

    expect(first.data.projects.map((project) => project.label)).toEqual(["other", "shared (1)", "shared (2)", "unique"])
    expect(new Set(first.data.projects.map((project) => project.id)).size).toBe(first.data.projects.length)
    expect(first.data.truncated).toBe(false)
    expect(JSON.stringify(first.data.projects)).not.toContain(tempDir)
    for (const project of first.data.projects) {
      expect(project.id).toMatch(/^[a-f0-9]{64}$/)
      expect(project.label).not.toContain(firstRoot)
      expect(project.label).not.toContain(secondRoot)
    }
  })

  test("skips symlink, missing, and non-directory roots and entries", async () => {
    const missingRoot = path.join(tempDir, "missing-root")
    const fileRoot = path.join(tempDir, "file-root")
    await fs.writeFile(fileRoot, "not a directory")

    const result = await projectDiscoveryList([path.join(tempDir, "linked-root"), missingRoot, fileRoot, firstRoot])
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.projects.map((project) => project.label)).toEqual(["shared", "unique"])
    expect(result.data.truncated).toBe(false)
    expect(JSON.stringify(result.data.projects)).not.toContain(missingRoot)
    expect(JSON.stringify(result.data.projects)).not.toContain(fileRoot)
    expect(result.data.projects.some((project) => project.label === "linked-project")).toBe(false)
  })

  test("skips an inaccessible root", async () => {
    const inaccessibleRoot = path.join(tempDir, "inaccessible-root")
    await fs.mkdir(inaccessibleRoot)
    await fs.mkdir(path.join(inaccessibleRoot, "hidden-project"))
    await fs.chmod(inaccessibleRoot, 0o000)

    try {
      const result = await projectDiscoveryList([inaccessibleRoot])
      expect(result.success).toBe(true)
      if (result.success && process.getuid?.() !== 0) expect(result.data.projects).toEqual([])
    } finally {
      await fs.chmod(inaccessibleRoot, 0o700)
    }
  })

  test("applies a bounded deterministic project count", async () => {
    const boundedRoot = path.join(tempDir, "bounded-root")
    await fs.mkdir(boundedRoot)
    await Promise.all(["a", "b", "c", "d"].map((name) => fs.mkdir(path.join(boundedRoot, name))))
    await Promise.all(
      Array.from({ length: 50 }, (_, index) => fs.writeFile(path.join(boundedRoot, `file-${index}`), "")),
    )

    const result = await projectDiscoveryList([boundedRoot], { maxProjects: 2 })
    expect(result).toEqual({
      success: true,
      data: {
        projects: [expect.objectContaining({ label: "a" }), expect.objectContaining({ label: "b" })],
        truncated: true,
      },
    })
  })

  test("returns a bounded subset and signals an oversized root without exposing paths", async () => {
    const oversizedRoot = path.join(tempDir, "oversized-root")
    await fs.mkdir(oversizedRoot)
    await Promise.all(
      Array.from({ length: projectDiscoveryLimits.maximumEntriesPerRoot }, (_, index) =>
        fs.writeFile(path.join(oversizedRoot, `file-${index}`), ""),
      ),
    )
    await Promise.all([
      fs.mkdir(path.join(oversizedRoot, "a-project")),
      fs.mkdir(path.join(oversizedRoot, "b-project")),
    ])

    const result = await projectDiscoveryList([oversizedRoot])
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.projects.length).toBeLessThanOrEqual(projectDiscoveryLimits.maximumProjects)
    expect(result.data.projects.map((project) => project.label)).toEqual(["a-project", "b-project"])
    expect(result.data.truncated).toBe(true)
    expect(JSON.stringify(result.data)).not.toContain(oversizedRoot)
  })

  test("uses a bounded root subset and signals omitted roots", async () => {
    const roots = Array.from({ length: projectDiscoveryLimits.maximumRoots + 1 }, () => firstRoot)
    const result = await projectDiscoveryList(roots)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.truncated).toBe(true)
  })

  test("keeps maximum-length collision labels within the public response schema", async () => {
    const firstLongRoot = path.join(tempDir, "first-long-root")
    const secondLongRoot = path.join(tempDir, "second-long-root")
    const longName = "x".repeat(projectDiscoveryLimits.maximumLabelLength)
    await Promise.all([fs.mkdir(firstLongRoot), fs.mkdir(secondLongRoot)])
    await Promise.all([fs.mkdir(path.join(firstLongRoot, longName)), fs.mkdir(path.join(secondLongRoot, longName))])

    const result = await projectDiscoveryList([firstLongRoot, secondLongRoot])
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(v.safeParse(projectApiListResponseSchema, result.data).success).toBe(true)
    expect(result.data.projects.map((project) => project.label)).toEqual([
      `${"x".repeat(projectDiscoveryLimits.maximumLabelLength - 4)} (1)`,
      `${"x".repeat(projectDiscoveryLimits.maximumLabelLength - 4)} (2)`,
    ])
  })

  test("resolves only an ID in the current discovered set", async () => {
    const discovered = await projectDiscoveryList([firstRoot])
    expect(discovered.success).toBe(true)
    if (!discovered.success) return

    const selected = discovered.data.projects.find((project) => project.label === "unique")
    expect(selected).toBeDefined()
    if (selected === undefined) return

    const resolved = await projectResolve([firstRoot], selected.id)
    expect(resolved).toEqual({ success: true, data: { id: selected.id, rootDir: path.join(firstRoot, "unique") } })

    const unknown = await projectResolve([firstRoot], "0".repeat(64))
    expect(unknown.success).toBe(false)
    if (!unknown.success) expect(unknown.errorMessage).not.toContain(firstRoot)

    const pathLike = await projectResolve([firstRoot], path.join(firstRoot, "unique"))
    expect(pathLike.success).toBe(false)
    if (!pathLike.success) expect(pathLike.errorMessage).not.toContain(firstRoot)
  })

  test("rejects a selected project whose canonical directory changes before resolution", async () => {
    const raceRoot = path.join(tempDir, "race-root")
    const selectedPath = path.join(raceRoot, "selected")
    const replacementPath = path.join(raceRoot, "replacement")
    await fs.mkdir(raceRoot)
    await Promise.all([fs.mkdir(selectedPath), fs.mkdir(replacementPath)])

    const discovered = await projectDiscoveryList([raceRoot])
    expect(discovered.success).toBe(true)
    if (!discovered.success) return
    const selected = discovered.data.projects.find((project) => project.label === "selected")
    expect(selected).toBeDefined()
    if (selected === undefined) return

    await fs.rm(selectedPath, { recursive: true })
    await fs.symlink(replacementPath, selectedPath)

    const resolved = await projectResolve([raceRoot], selected.id)
    expect(resolved.success).toBe(false)
    if (!resolved.success) expect(resolved.errorMessage).not.toContain(raceRoot)
  })
})
