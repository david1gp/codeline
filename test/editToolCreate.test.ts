import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import * as v from "valibot"
import type { FileSystem } from "../src/tools/filesystem/fileSystem.js"
import type { EditToolCreate, EditToolExecute } from "../src/tools/runtime/editToolCreate.js"
import * as editToolCreateModule from "../src/tools/runtime/editToolCreate.js"
import { editToolInputSchema } from "../src/tools/schema/editToolInputSchema.js"
import { editToolOutputSchema } from "../src/tools/schema/editToolOutputSchema.js"

const editToolCreate = (editToolCreateModule as unknown as { editToolCreate: EditToolCreate }).editToolCreate
const fileSystem = {} as FileSystem
const signal = new AbortController().signal

test("edit tool declares its name and current strict input/output schemas", () => {
  const tool = editToolCreate({ fileSystem, projectRoot: "/workspace" })
  expect(tool.name as string).toBe("edit")
  expect(tool.inputSchema).toBe(editToolInputSchema)
  expect(tool.outputSchema).toBe(editToolOutputSchema)
})

test("edit input schema requires old and new strings and accepts replace_all", () => {
  const run = (input: unknown) => v.safeParse(editToolInputSchema, input).success
  expect(run({ file_path: "file.txt", old_string: "old", new_string: "new", replace_all: true })).toBe(true)
  for (const input of [
    { file_path: "file.txt", old_string: "", new_string: "new" },
    { file_path: "", old_string: "old", new_string: "new" },
    { file_path: "bad\0path", old_string: "old", new_string: "new" },
    { file_path: "file.txt", old_string: "old", new_string: "new", extra: true },
  ])
    expect(run(input)).toBe(false)
})

test("edit tool maps context and exact edit inputs to its action", async () => {
  let receivedInput: unknown
  let receivedOptions: Parameters<EditToolExecute>[1] | undefined
  const execute: EditToolExecute = async (input, options) => {
    receivedInput = input
    receivedOptions = options
    return createResult({ after: "new", before: "old", path: "/workspace/file.txt" })
  }
  const tool = editToolCreate({ execute, fileSystem, projectRoot: "/workspace" })
  const result = await tool.execute(
    { outputLimit: 1_024, signal, timeoutMs: 50, toolCallId: "edit-1" },
    {
      file_path: "file.txt",
      new_string: "new",
      old_string: "old",
      replace_all: true,
    },
  )

  expect(result).toMatchObject({ success: true, data: { before: "old", after: "new" } })
  expect(receivedInput).toEqual({ file_path: "file.txt", new_string: "new", old_string: "old", replace_all: true })
  expect(receivedOptions).toEqual({ fileSystem, outputLimit: 1_024, projectRoot: "/workspace", signal, timeoutMs: 50 })
})

test("edit tool preserves structured filesystem errors and output contract", async () => {
  const execute: EditToolExecute = async () => ({
    success: false,
    op: "editExecute",
    code: "FS_AMBIGUOUS_EDIT",
    errorMessage: "The replacement was ambiguous.",
  })
  const tool = editToolCreate({ execute, fileSystem, projectRoot: "/workspace" })
  const result = await tool.execute(
    { signal, toolCallId: "edit-2" },
    {
      file_path: "file.txt",
      new_string: "new",
      old_string: "old",
    },
  )

  expect(result).toMatchObject({ success: false, code: "FS_AMBIGUOUS_EDIT" })
  expect(tool.outputSchema).toBe(editToolOutputSchema)
})
