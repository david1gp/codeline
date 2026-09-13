import { expect, test } from "bun:test"
import * as v from "valibot"
import { configurationEntriesSchema } from "../../../src/configuration/ui/configurationEntriesSchema.js"
import { configurationFixtures } from "../../../src/configuration/ui/configurationFixtures.js"

test("configuration editor fixtures are deterministic and valid", () => {
  expect(Object.keys(configurationFixtures)).toEqual(["subagents", "skills", "commands"])

  for (const entries of Object.values(configurationFixtures)) {
    expect(v.safeParse(configurationEntriesSchema, entries).success).toBe(true)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
  }
})
