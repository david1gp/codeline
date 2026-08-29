import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import * as v from "valibot"
import type { FileSystem } from "../src/tools/filesystem/fileSystem.js"
import type { ReadToolCreate, ReadToolExecute } from "../src/tools/runtime/readToolCreate.js"
import * as readToolCreateModule from "../src/tools/runtime/readToolCreate.js"
import { readToolInputSchema } from "../src/tools/schema/readToolInputSchema.js"
import { readToolOutputSchema } from "../src/tools/schema/readToolOutputSchema.js"

const readToolCreate = (readToolCreateModule as unknown as { readToolCreate: ReadToolCreate }).readToolCreate
const fileSystem = {} as FileSystem
const signal = new AbortController().signal

test("read tool declares its name and current strict input/output schemas", () => {
  const tool = readToolCreate({ fileSystem, projectRoot: "/workspace" })

  expect(tool.name as string).toBe("read")
  expect(tool.inputSchema).toBe(readToolInputSchema)
  expect(tool.outputSchema).toBe(readToolOutputSchema)
})

test("read input schema bounds paths and pagination and rejects extra fields", () => {
  const valid = { file_path: "src/file.ts", offset: 2, limit: 20 }

  for (const input of [
    { file_path: "" },
    { file_path: "   " },
    { file_path: "bad\0path" },
    { file_path: "file.ts", offset: 0 },
    { file_path: "file.ts", offset: 1.5 },
    { file_path: "file.ts", limit: 0 },
    { file_path: "file.ts", limit: 2_001 },
    { ...valid, extra: true },
  ])
    expect(v.safeParse(readToolInputSchema, input).success).toBe(false)
})

test("read tool forwards execution context and defaults its runtime bounds", async () => {
  let received: Parameters<ReadToolExecute>[1] | undefined
  const execute: ReadToolExecute = async (_input, options) => {
    received = options
    return createResult({ lines: [], offset: 1, path: "/workspace/file.ts", totalLines: 0, version: "version-1" })
  }
  const tool = readToolCreate({ execute, fileSystem, projectRoot: "/workspace" })

  const result = await tool.execute({ signal, timeoutMs: null, toolCallId: "read-1" }, { file_path: "file.ts" })

  expect(result).toMatchObject({ success: true, data: { path: "/workspace/file.ts" } })
  expect(received).toMatchObject({
    fileSystem,
    outputLimit: 16_384,
    projectRoot: "/workspace",
    signal,
    timeoutMs: null,
  })
})

test("read tool preserves a structured action error and validates successful output", async () => {
  const execute: ReadToolExecute = async () => ({
    success: false,
    op: "readExecute",
    code: "FS_NOT_FOUND",
    errorMessage: "The file was not found.",
  })
  const tool = readToolCreate({ execute, fileSystem, projectRoot: "/workspace" })
  const error = await tool.execute({ signal, toolCallId: "read-2" }, { file_path: "missing.txt" })

  expect(error).toMatchObject({ success: false, code: "FS_NOT_FOUND" })
  const output = await readToolCreate({
    execute: async () =>
      createResult({ lines: [], offset: 1, path: "/workspace/file.ts", totalLines: 0, version: "version-1" }),
    fileSystem,
    projectRoot: "/workspace",
  }).execute({ signal, toolCallId: "read-3" }, { file_path: "file.ts" })
  if (output.success) expect(v.safeParse(readToolOutputSchema, output.data).success).toBe(true)
})
