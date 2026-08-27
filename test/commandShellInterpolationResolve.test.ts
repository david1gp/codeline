import { expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { commandShellInterpolationResolve } from "../src/commands/actions/commandShellInterpolationResolve.js"
import { bashToolCreate } from "../src/tools/runtime/bashToolCreate.js"
import type { ToolRegistry } from "../src/tools/runtime/toolRegistry.js"
import { toolRegistryCreate } from "../src/tools/runtime/toolRegistryCreate.js"

const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-command-shell-"))

function registryCreate(options: {
  enabled?: boolean
  execute?: Parameters<typeof bashToolCreate>[0]["execute"]
}): ToolRegistry {
  const registry = toolRegistryCreate()
  const registered = registry.register({
    ...bashToolCreate({
      projectRoot,
      ...(options.execute === undefined ? {} : { execute: options.execute }),
    }),
    enabled: options.enabled ?? true,
  })
  if (!registered.success) throw new Error(registered.errorMessage)
  return registry
}

test("text without interpolation passes through untouched and never starts bash", async () => {
  let calls = 0
  const registry = registryCreate({
    execute: async () => {
      calls += 1
      return createResult({ exitCode: 0, stderr: "", stdout: "", truncated: false, workingDirectory: projectRoot })
    },
  })

  const resolved = await commandShellInterpolationResolve("Plain command text.", {
    registry,
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })

  expect(resolved).toMatchObject({ success: true, data: "Plain command text." })
  expect(calls).toBe(0)
})

test("substitutes every interpolation through the bounded bash runtime in order", async () => {
  const commands: string[] = []
  const registry = registryCreate({
    execute: async (input, options) => {
      commands.push(input.command)
      expect(options.projectRoot).toBe(projectRoot)
      expect(options.outputLimit).toBe(16_384)
      expect(options.timeoutMs).toBe(30_000)
      return createResult({
        exitCode: 0,
        stderr: "",
        stdout: `${input.command}-out\n\n`,
        truncated: false,
        workingDirectory: projectRoot,
      })
    },
  })

  const resolved = await commandShellInterpolationResolve("A !`first` B !`second` C", {
    registry,
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })

  expect(resolved).toMatchObject({ success: true, data: "A first-out B second-out C" })
  expect(commands).toEqual(["first", "second"])
})

test("interpolation runs a real bounded shell command inside the declared working directory", async () => {
  const registry = registryCreate({})
  const resolved = await commandShellInterpolationResolve("Root is !`pwd`.", {
    registry,
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })

  expect(resolved.success).toBe(true)
  if (!resolved.success) return
  expect(resolved.data).toContain(await fs.realpath(projectRoot))
})

test("rejects interpolation when the bash tool is disabled", async () => {
  const registry = registryCreate({ enabled: false })
  const resolved = await commandShellInterpolationResolve("Value: !`echo hi`", {
    registry,
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })

  expect(resolved).toMatchObject({ success: false, code: "tool.disabled" })
  if (!resolved.success) expect(resolved.errorMessage).toContain("bash")
})

test("rejects interpolation when no bash tool is registered at all", async () => {
  const resolved = await commandShellInterpolationResolve("Value: !`echo hi`", {
    registry: toolRegistryCreate(),
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })
  expect(resolved).toMatchObject({ success: false, code: "tool.disabled" })
})

test("a nonzero exit code fails the expansion with the captured stderr", async () => {
  const registry = registryCreate({
    execute: async () =>
      createResult({
        exitCode: 3,
        stderr: "the interpolated script failed\n",
        stdout: "",
        truncated: false,
        workingDirectory: projectRoot,
      }),
  })

  const resolved = await commandShellInterpolationResolve("Value: !`false`", {
    registry,
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })

  expect(resolved).toMatchObject({ success: false, code: "tool.execution-failed" })
  if (!resolved.success) expect(resolved.errorMessage).toBe("the interpolated script failed")
})

test("a nonzero exit code without stderr still reports the exit code", async () => {
  const registry = registryCreate({
    execute: async () =>
      createResult({ exitCode: 7, stderr: "  ", stdout: "", truncated: false, workingDirectory: projectRoot }),
  })
  const resolved = await commandShellInterpolationResolve("Value: !`false`", {
    registry,
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })
  expect(resolved).toMatchObject({ success: false })
  if (!resolved.success) expect(resolved.errorMessage).toContain("7")
})

test("an already aborted signal fails before any interpolation executes", async () => {
  let calls = 0
  const registry = registryCreate({
    execute: async () => {
      calls += 1
      return createResult({ exitCode: 0, stderr: "", stdout: "", truncated: false, workingDirectory: projectRoot })
    },
  })
  const controller = new AbortController()
  controller.abort()

  const resolved = await commandShellInterpolationResolve("Value: !`echo hi`", {
    registry,
    signal: controller.signal,
    workingDirectory: projectRoot,
  })

  expect(resolved).toMatchObject({ success: false, code: "tool.aborted" })
  expect(calls).toBe(0)
})

test("aborting during an interpolation propagates the aborted failure", async () => {
  const controller = new AbortController()
  const registry = registryCreate({
    execute: async (_input, options) =>
      new Promise((resolve) => {
        options.signal.addEventListener("abort", () =>
          resolve(
            createResult({ exitCode: 0, stderr: "", stdout: "", truncated: false, workingDirectory: projectRoot }),
          ),
        )
      }),
  })

  const pending = commandShellInterpolationResolve("Value: !`sleep 5`", {
    registry,
    signal: controller.signal,
    workingDirectory: projectRoot,
  })
  controller.abort()

  expect(await pending).toMatchObject({ success: false, code: "tool.aborted" })
})

test("a timed out interpolation reports the timeout code", async () => {
  const registry = registryCreate({
    execute: async (_input, options) =>
      new Promise((resolve) => {
        options.signal.addEventListener("abort", () =>
          resolve(
            createResult({ exitCode: 0, stderr: "", stdout: "", truncated: false, workingDirectory: projectRoot }),
          ),
        )
      }),
  })

  const resolved = await commandShellInterpolationResolve("Value: !`sleep 5`", {
    registry,
    signal: new AbortController().signal,
    timeoutMs: 10,
    workingDirectory: projectRoot,
  })

  expect(resolved).toMatchObject({ success: false, code: "tool.timeout" })
})

test("an empty interpolation and invalid text are rejected deterministically", async () => {
  const registry = registryCreate({})
  const signal = new AbortController().signal

  expect(
    await commandShellInterpolationResolve("Value: !``", { registry, signal, workingDirectory: projectRoot }),
  ).toMatchObject({ success: false, code: "tool.invalid-input" })
  expect(
    await commandShellInterpolationResolve("Value: !`   `", { registry, signal, workingDirectory: projectRoot }),
  ).toMatchObject({ success: false, code: "tool.invalid-input" })
  expect(
    await commandShellInterpolationResolve("a\0b !`echo hi`", { registry, signal, workingDirectory: projectRoot }),
  ).toMatchObject({ success: false, code: "tool.invalid-input" })
  expect(
    await commandShellInterpolationResolve(`${"x".repeat(100_001)} !\`echo hi\``, {
      registry,
      signal,
      workingDirectory: projectRoot,
    }),
  ).toMatchObject({ success: false, code: "tool.invalid-input" })
})

test("an expansion that would exceed the maximum length is rejected", async () => {
  const registry = registryCreate({
    execute: async () =>
      createResult({
        exitCode: 0,
        stderr: "",
        stdout: "y".repeat(100_001),
        truncated: false,
        workingDirectory: projectRoot,
      }),
  })

  const resolved = await commandShellInterpolationResolve("Value: !`echo big`", {
    registry,
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })

  expect(resolved.success).toBe(false)
})

test("multiline interpolated commands and multiline output are preserved", async () => {
  const registry = registryCreate({
    execute: async (input) =>
      createResult({
        exitCode: 0,
        stderr: "",
        stdout: input.command.includes("\n") ? "line-1\nline-2\n" : "single",
        truncated: false,
        workingDirectory: projectRoot,
      }),
  })

  const resolved = await commandShellInterpolationResolve("Out:\n!`echo a\necho b`\nEnd", {
    registry,
    signal: new AbortController().signal,
    workingDirectory: projectRoot,
  })

  expect(resolved).toMatchObject({ success: true, data: "Out:\nline-1\nline-2\nEnd" })
})
