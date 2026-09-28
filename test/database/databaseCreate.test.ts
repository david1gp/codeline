import { expect, spyOn, test } from "bun:test"
import * as databaseConnectionModule from "../../src/database/databaseConnectionCreate.js"
import { databaseCreate } from "../../src/database/databaseCreate.js"
import { databasePath } from "../../src/database/databasePath.js"

test("database creation keeps the preview default unless an absolute path or file URL is explicitly injected", () => {
  const paths: string[] = []
  const connection = {} as ReturnType<typeof databaseConnectionModule.databaseConnectionCreate>
  const create = spyOn(databaseConnectionModule, "databaseConnectionCreate").mockImplementation((path) => {
    paths.push(path)
    return connection
  })
  const configuration = { databaseUrl: "file:///tmp/opencode/not-selected.sqlite", nodeEnv: "test" } as const
  try {
    for (const target of [undefined, "/tmp/opencode/selected.sqlite", "file:///tmp/opencode/selected.sqlite"]) {
      const result = databaseCreate(configuration, target)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data).toBe(connection)
    }
    expect(paths).toEqual([databasePath, "/tmp/opencode/selected.sqlite", "/tmp/opencode/selected.sqlite"])
    expect(databaseCreate(configuration, "data/db.sqlite").success).toBe(false)
    expect(create).toHaveBeenCalledTimes(3)
  } finally {
    create.mockRestore()
  }
})
