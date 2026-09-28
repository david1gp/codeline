import { expect, test } from "bun:test"
import { pathToFileURL } from "node:url"
import { createResult } from "@adaptive-ds/result"
import { databaseFilePathResolve } from "../../src/database/databaseFilePathResolve.js"

test("explicit SQLite targets resolve absolute paths and encoded file URLs without cwd resolution", () => {
  const path = "/tmp/opencode/local data/#%?.sqlite"
  expect(databaseFilePathResolve(path)).toEqual(createResult(path))
  expect(databaseFilePathResolve(pathToFileURL(path).href)).toEqual(createResult(path))
})

test("explicit SQLite targets reject relative, network, malformed and URL-option inputs", () => {
  for (const input of [
    "",
    "data/db.sqlite",
    "file:data/db.sqlite",
    "file:./data/db.sqlite",
    "file:/tmp/db.sqlite",
    "libsql://database.test",
    "https://database.test",
    "file://server/tmp/db.sqlite",
    "file:///tmp/db.sqlite?mode=ro",
    "file:///tmp/db.sqlite#fragment",
    "file:///tmp/%zz.sqlite",
    "file:///tmp/%00.sqlite",
    "file:///tmp/encoded%2fseparator.sqlite",
    "/tmp/\0.sqlite",
  ])
    expect(databaseFilePathResolve(input).success, input).toBe(false)
})
