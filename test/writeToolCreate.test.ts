import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import * as v from "valibot"
import type { FileSystem } from "../src/tools/filesystem/fileSystem.js"
import type { WriteToolCreate, WriteToolExecute } from "../src/tools/runtime/writeToolCreate.js"
import * as writeToolCreateModule from "../src/tools/runtime/writeToolCreate.js"
import { writeToolInputSchema } from "../src/tools/schema/writeToolInputSchema.js"
import { writeToolOutputSchema } from "../src/tools/schema/writeToolOutputSchema.js"

const writeToolCreate = (writeToolCreateModule as unknown as { writeToolCreate: WriteToolCreate }).writeToolCreate
const fileSystem = {} as FileSystem
const signal = new AbortController().signal

test("write tool declares its name and current strict input/output schemas", () => {
  const tool = writeToolCreate({ fileSystem, projectRoot: "/workspace" })
  expect(tool.name as string).toBe("write")
  expect(tool.inputSchema).toBe(writeToolInputSchema)
  expect(tool.outputSchema).toBe(writeToolOutputSchema)
})

test("write input schema requires exact path and content fields", () => {
  const run = (input: unknown) => v.safeParse(writeToolInputSchema, input).success
  expect(run({ file_path: "file.txt", content: "text" })).toBe(true)
  for (const input of [
    { file_path: "", content: "text" },
    { file_path: "   ", content: "text" },
    { file_path: "bad\0path", content: "text" },
    { file_path: "file.txt" },
    { file_path: "file.txt", content: "text", extra: true },
  ])
    expect(run(input)).toBe(false)
})

test("write tool forwards context limits and the project root to its action", async () => {
  let received: Parameters<WriteToolExecute>[1] | undefined
  const execute: WriteToolExecute = async (_input, options) => {
    received = options
    return createResult({ after: "text", before: null, operation: "create", path: "/workspace/file.txt" })
  }
  const tool = writeToolCreate({ execute, fileSystem, projectRoot: "/workspace" })

  const result = await tool.execute(
    { outputLimit: 512, signal, timeoutMs: 25, toolCallId: "write-1" },
    {
      content: "text",
      file_path: "file.txt",
    },
  )

  expect(result).toMatchObject({ success: true, data: { operation: "create" } })
  expect(received).toEqual({ fileSystem, outputLimit: 512, projectRoot: "/workspace", signal, timeoutMs: 25 })
})

test("write tool preserves structured action errors and exact guarded replacement inputs", async () => {
  let receivedInput: unknown
  const execute: WriteToolExecute = async (input) => {
    receivedInput = input
    return {
      success: false,
      op: "writeExecute",
      code: "FS_STALE_VERSION",
      errorMessage: "re-read the file, then retry",
    }
  }
  const result = await writeToolCreate({ execute, fileSystem, projectRoot: "/workspace" }).execute(
    { signal, toolCallId: "write-2" },
    { content: "replacement", file_path: "file.txt" },
  )

  expect(receivedInput).toEqual({ content: "replacement", file_path: "file.txt" })
  expect(result).toMatchObject({ success: false, code: "FS_STALE_VERSION" })
})
