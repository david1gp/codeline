import { expect, test } from "bun:test"
import { uuidv7 } from "../src/uuid/uuidv7.js"

test("uuidv7 generates UUID version 7 values", () => {
  const value = uuidv7()
  const parts = value.split("-")

  expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(parts).toHaveLength(5)
})
