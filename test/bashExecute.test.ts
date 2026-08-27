import { afterEach, beforeEach, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { bashExecute } from "../src/tools/actions/bashExecute.js"
import { toolErrorCodes } from "../src/tools/runtime/toolErrorCodes.js"

let projectRoot = ""

beforeEach(async () => {
  projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-bash-execute-"))
})

afterEach(async () => {
  await fs.rm(projectRoot, { force: true, recursive: true })
})

test("runs a command successfully and preserves stdout, stderr, exit code, and cwd", async () => {
  const result = await bashExecute({ command: "printf 'stdout'; printf 'stderr' >&2" }, { projectRoot })

  expect(result).toEqual({
    success: true,
    data: {
      exitCode: 0,
      stderr: "stderr",
      stdout: "stdout",
      truncated: false,
      workingDirectory: projectRoot,
    },
  })
})

test("returns nonzero exit codes without discarding command output", async () => {
  const result = await bashExecute(
    { command: "printf 'before failure'; printf 'diagnostic' >&2; exit 7" },
    { projectRoot },
  )

  expect(result).toEqual({
    success: true,
    data: {
      exitCode: 7,
      stderr: "diagnostic",
      stdout: "before failure",
      truncated: false,
      workingDirectory: projectRoot,
    },
  })
})

test("rejects missing, file, and escaping working directories", async () => {
  const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-bash-outside-"))
  const filePath = path.join(projectRoot, "not-a-directory")
  await fs.writeFile(filePath, "file", "utf8")

  try {
    for (const workingDirectory of [
      path.join(projectRoot, "missing"),
      filePath,
      path.relative(projectRoot, outsideDirectory),
    ]) {
      const result = await bashExecute({ command: "printf never", workingDirectory }, { projectRoot })
      expect(result).toMatchObject({
        code: toolErrorCodes.invalidInput,
        success: false,
      })
    }
  } finally {
    await fs.rm(outsideDirectory, { force: true, recursive: true })
  }
})

test("rejects a symlink working directory that resolves outside the project", async () => {
  const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-bash-symlink-outside-"))
  const linkPath = path.join(projectRoot, "linked-outside")
  await fs.symlink(outsideDirectory, linkPath, "dir")

  try {
    const result = await bashExecute({ command: "printf never", workingDirectory: linkPath }, { projectRoot })
    expect(result).toMatchObject({
      code: toolErrorCodes.invalidInput,
      errorMessage: "The bash working directory must be a project descendant.",
      success: false,
    })
  } finally {
    await fs.rm(outsideDirectory, { force: true, recursive: true })
  }
})

test("returns a timeout while terminating a sleeping command", async () => {
  const startedAt = Date.now()
  const result = await bashExecute({ command: "sleep 10" }, { projectRoot, timeoutMs: 50 })

  expect(result).toMatchObject({
    code: toolErrorCodes.timeout,
    errorMessage: "The bash command timed out.",
    success: false,
  })
  expect(Date.now() - startedAt).toBeLessThan(2_000)
})

test("cancels while stdout and stderr reads are waiting for the process", async () => {
  const controller = new AbortController()
  const execution = bashExecute(
    { command: "printf 'partial'; printf 'diagnostic' >&2; sleep 10" },
    { projectRoot, signal: controller.signal, timeoutMs: null },
  )
  await new Promise<void>((resolve) => setTimeout(resolve, 25))
  controller.abort()

  const result = await Promise.race([
    execution,
    new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 1_000)),
  ])
  expect(result).not.toBe("hung")
  expect(result).toMatchObject({
    code: toolErrorCodes.aborted,
    errorMessage: "The bash command was aborted.",
    success: false,
  })
})

test("truncates stdout and stderr while retaining structured output", async () => {
  const result = await bashExecute(
    {
      command: "head -c 2048 /dev/zero | tr '\\0' o; head -c 2048 /dev/zero | tr '\\0' e >&2",
    },
    { outputLimit: 512, projectRoot },
  )

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.data.truncated).toBe(true)
  expect(result.data.stdout.length).toBeGreaterThan(0)
  expect(result.data.stdout.length).toBeLessThan(2_048)
  expect(result.data.stdout).toMatch(/^o+$/)
  expect(result.data.stderr.length).toBeGreaterThan(0)
  expect(result.data.stderr.length).toBeLessThan(2_048)
  expect(result.data.stderr).toMatch(/^e+$/)
  expect(JSON.stringify(result.data).length).toBeLessThanOrEqual(512)
})

test("does not lose a command that exits before a late cancellation", async () => {
  const controller = new AbortController()
  const result = await bashExecute({ command: "printf complete" }, { projectRoot, signal: controller.signal })
  controller.abort()

  expect(result).toMatchObject({ success: true, data: { exitCode: 0, stdout: "complete" } })
})
