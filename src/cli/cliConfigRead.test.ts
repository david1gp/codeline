import { describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliConfigRead } from "./cliConfigRead.js"

describe("cliConfigRead", () => {
  test("defaults missing settings and validates config fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codeline-cli-config-"))
    try {
      const missing = await cliConfigRead(join(directory, "missing.json"))
      expect(missing).toEqual({ success: true, data: {} })
      const path = join(directory, "config.json")
      await writeFile(path, JSON.stringify({ backend: "https://codeline.example", project: "project-1" }))
      const valid = await cliConfigRead(path)
      expect(valid).toEqual({ success: true, data: { backend: "https://codeline.example", project: "project-1" } })
      await writeFile(path, JSON.stringify({ unexpected: true }))
      expect((await cliConfigRead(path)).success).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
