import { expect, test } from "bun:test"
import * as v from "valibot"
import type { FileSystem } from "../src/tools/filesystem/fileSystem.js"
import { bashToolCreate } from "../src/tools/runtime/bashToolCreate.js"
import { editToolCreate } from "../src/tools/runtime/editToolCreate.js"
import { readToolCreate } from "../src/tools/runtime/readToolCreate.js"
import { toolRegistryCreate } from "../src/tools/runtime/toolRegistryCreate.js"
import { writeToolCreate } from "../src/tools/runtime/writeToolCreate.js"

const fileSystem = {} as FileSystem
const projectRoot = "/workspace"

test("registers bash and the structured file tools with their exact public contracts", () => {
  const registry = toolRegistryCreate()
  expect(registry.register(bashToolCreate({ projectRoot })).success).toBe(true)
  expect(registry.register(readToolCreate({ fileSystem, projectRoot })).success).toBe(true)
  expect(registry.register(writeToolCreate({ fileSystem, projectRoot })).success).toBe(true)
  expect(registry.register(editToolCreate({ fileSystem, projectRoot })).success).toBe(true)

  expect(registry.list()).toEqual(["bash", "read", "write", "edit"])
  expect(registry.get("bash")?.name).toBe("bash")
  expect(registry.get("read")?.name).toBe("read")
  expect(registry.get("write")?.name).toBe("write")
  expect(registry.get("edit")?.name).toBe("edit")
  const read = registry.get("read")
  const write = registry.get("write")
  const edit = registry.get("edit")
  if (read === undefined || write === undefined || edit === undefined) throw new Error("file tools were not registered")
  expect(v.safeParse(read.inputSchema, { file_path: "src/file.ts" }).success).toBe(true)
  expect(v.safeParse(write.inputSchema, { content: "text", file_path: "src/file.ts" }).success).toBe(true)
  expect(
    v.safeParse(edit.inputSchema, {
      file_path: "src/file.ts",
      new_string: "new",
      old_string: "old",
    }).success,
  ).toBe(true)
})

test("does not advertise disabled structured file tools but retains their registrations", () => {
  const registry = toolRegistryCreate()
  const registered = registry.register({ ...readToolCreate({ fileSystem, projectRoot }), enabled: false })

  expect(registered.success).toBe(true)
  expect(registry.get("read")?.enabled).toBe(false)
  expect(registry.list()).toEqual([])
})

test("rejects duplicate structured file registrations", () => {
  const registry = toolRegistryCreate()

  expect(registry.register(writeToolCreate({ fileSystem, projectRoot })).success).toBe(true)
  expect(registry.register(writeToolCreate({ fileSystem, projectRoot }))).toMatchObject({ success: false })
})
