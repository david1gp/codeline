import { expect, test } from "bun:test"
import path from "node:path"
import { databasePath } from "../src/database/databasePath.js"
import { databaseUrl } from "../src/database/databaseUrl.js"

test("the SQLite database path and URL use data/db.sqlite", () => {
  expect(databasePath).toBe("data/db.sqlite")
  expect(databaseUrl).toBe(`file://${path.resolve(databasePath)}`)
})
