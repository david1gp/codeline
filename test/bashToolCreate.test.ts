import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { bashToolCreate } from "../src/tools/runtime/bashToolCreate.js"

test("passes the typed bash input and bounded registry context to its executor", async () => {
  const calls: Array<{ input: unknown; options: unknown }> = []
  const tool = bashToolCreate({
    execute: async (input, options) => {
      calls.push({ input, options })
      return createResult({
        exitCode: 0,
        stderr: "",
        stdout: "ok",
        truncated: false,
        workingDirectory: "/tmp/project",
      })
    },
    projectRoot: "/tmp/project",
  })
  const signal = new AbortController().signal

  const result = await tool.execute(
    { outputLimit: 300, signal, timeoutMs: 400, toolCallId: "call-1" },
    { command: "printf ok", workingDirectory: "nested" },
  )

  expect(result).toMatchObject({ success: true, data: { stdout: "ok" } })
  expect(calls).toEqual([
    {
      input: { command: "printf ok", workingDirectory: "nested" },
      options: { outputLimit: 300, projectRoot: "/tmp/project", signal, timeoutMs: 400 },
    },
  ])
})

test("applies registry defaults when optional execution bounds are absent", async () => {
  let received: { outputLimit: number; projectRoot: string; signal: AbortSignal; timeoutMs: number | null } | undefined
  const tool = bashToolCreate({
    execute: async (_input, options) => {
      received = options
      return createResult({
        exitCode: 0,
        stderr: "",
        stdout: "",
        truncated: false,
        workingDirectory: "/tmp/project",
      })
    },
    projectRoot: "/tmp/project",
  })
  const signal = new AbortController().signal

  await tool.execute({ signal, toolCallId: "call-2" }, { command: "true" })

  expect(received).toEqual({ outputLimit: 16_384, projectRoot: "/tmp/project", signal, timeoutMs: 30_000 })
})
