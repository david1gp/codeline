import { expect, test } from "bun:test"
import { createResultError } from "@adaptive-ds/result"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"

test("database transaction rolls back writes when the operation returns a domain error", async () => {
  const rows = ["existing"]
  let rollbackCount = 0
  const database = {
    transaction: async (operation: (transaction: unknown) => Promise<unknown>) => {
      const snapshot = [...rows]
      try {
        return await operation({})
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot)
        rollbackCount += 1
        throw error
      }
    },
  }

  const result = await databaseTransactionRun(database as never, async () => {
    rows.push("transient")
    return createResultError("domainOperation", "The domain operation failed.")
  })

  expect(result).toEqual(createResultError("domainOperation", "The domain operation failed."))
  expect(rows).toEqual(["existing"])
  expect(rollbackCount).toBe(1)
})
