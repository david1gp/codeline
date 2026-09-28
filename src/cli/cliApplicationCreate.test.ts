import { describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { run } from "@stricli/core"
import { cliApplicationCreate } from "./cliApplicationCreate.js"

describe("CLI command grammar", () => {
  test("parses remote run options and requires environment authentication", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codeline-cli-grammar-"))
    const output: string[] = []
    const process = { stdout: { write: () => {} }, stderr: { write: (text: string) => output.push(text) }, exitCode: 0 }
    try {
      await run(
        cliApplicationCreate(),
        ["run", "fix the bug", "--backend", "https://server.example", "--project", "project-1"],
        {
          process,
          configPath: join(directory, "missing.json"),
          env: {},
        },
      )
      expect(output.join("")).toContain("CODELINE_SESSION_TOKEN")
      expect(output.join("")).not.toContain("Not implemented")
      expect(process.exitCode).toBe(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("does not accept a session token CLI flag", async () => {
    const output: string[] = []
    const process = {
      stdout: { write: () => {} },
      stderr: { write: (text: string) => output.push(text) },
      exitCode: undefined as number | undefined,
    }
    await run(cliApplicationCreate(), ["run", "hello", "--session-token", "not-a-credential"], {
      process,
      configPath: "/tmp/opencode/missing-cli-config.json",
      env: {},
    })
    expect(process.exitCode).not.toBe(0)
    expect(output.join("")).toContain("session-token")
  })

  test("uses interactive chat as the command default", async () => {
    const directory = await mkdtemp(join(tmpdir(), "codeline-cli-chat-"))
    const output: string[] = []
    const process = { stdout: { write: () => {} }, stderr: { write: (text: string) => output.push(text) }, exitCode: 0 }
    try {
      await run(cliApplicationCreate(), [], { process, configPath: join(directory, "missing.json") })
      expect(output.join("")).toContain("requires a TTY")
      expect(output.join("")).toContain("codeline run")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
