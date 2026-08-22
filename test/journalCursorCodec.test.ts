import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"

test("deterministic snapshot cursors are stable and retain authenticated ownership", () => {
  const created = journalCursorCodecCreate({ randomBytes, secret: "journal-cursor-test-secret" })
  expect(created.success).toBe(true)
  if (!created.success) return

  const first = created.data.encodeDeterministic("user-a", 12)
  const repeated = created.data.encodeDeterministic("user-a", 12)
  expect(first).toEqual(repeated)
  if (!first.success) return
  expect(first.data).not.toContain("user-a")
  expect(created.data.validate(first.data, "user-a")).toMatchObject({
    data: { journalId: "user-a", sequence: 12 },
    success: true,
  })
  expect(created.data.validate(first.data, "user-b")).toMatchObject({
    code: "cursor_owner_mismatch",
    success: false,
  })
})
