import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createResult, createResultError } from "@adaptive-ds/result"
import { createClient } from "@libsql/client"
import { sql } from "drizzle-orm"
import { drizzle, LibSQLTransaction } from "drizzle-orm/libsql"
import { databaseExecutorTransactionRun } from "../src/database/databaseExecutorTransactionRun.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"

function temporaryDatabaseCreate() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "codeline-transaction-"))
  const client = createClient({ url: `file:${path.join(directory, "database.sqlite")}`, timeout: 5_000 })
  const database = drizzle(client)

  return {
    database,
    dispose: () => {
      client.close()
      rmSync(directory, { force: true, recursive: true })
    },
  }
}

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

test("database transaction requests an immediate SQLite write transaction", async () => {
  let transactionConfig: unknown
  const database = {
    transaction: async (operation: (transaction: unknown) => Promise<unknown>, config: unknown) => {
      transactionConfig = config
      return await operation({})
    },
  }

  const result = await databaseTransactionRun(database as never, async () => createResult("committed"))

  expect(result).toEqual(createResult("committed"))
  expect(transactionConfig).toEqual({ behavior: "immediate" })
})

test("database transaction awaits the callback and commits completed writes", async () => {
  const { database, dispose } = temporaryDatabaseCreate()
  try {
    await database.run(sql`create table transaction_entry (value text not null)`)
    let callbackCompleted = false

    const result = await databaseTransactionRun(database as never, async (transaction) => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      await transaction.run(sql`insert into transaction_entry (value) values ('completed')`)
      callbackCompleted = true
      return createResult("committed")
    })

    const entries = await database.all<{ value: string }>(sql`select value from transaction_entry`)
    expect(result).toEqual(createResult("committed"))
    expect(callbackCompleted).toBe(true)
    expect(entries).toEqual([{ value: "completed" }])
  } finally {
    dispose()
  }
})

test("database executor transaction run preserves an existing libSQL transaction", async () => {
  const transaction = Object.create(LibSQLTransaction.prototype)
  let receivedExecutor: unknown

  const result = await databaseExecutorTransactionRun(transaction as never, async (executor) => {
    receivedExecutor = executor
    return createResult("nested")
  })

  expect(result).toEqual(createResult("nested"))
  expect(receivedExecutor).toBe(transaction)
})

test("libSQL write transactions serialize concurrent mutations", async () => {
  const { database, dispose } = temporaryDatabaseCreate()
  try {
    await database.run(sql`create table transaction_entry (value integer not null)`)
    let activeTransactions = 0
    let maximumActiveTransactions = 0

    const results = await Promise.all(
      [1, 2].map((value) =>
        databaseTransactionRun(database as never, async (transaction) => {
          activeTransactions += 1
          maximumActiveTransactions = Math.max(maximumActiveTransactions, activeTransactions)
          await transaction.run(sql`insert into transaction_entry (value) values (${value})`)
          await new Promise((resolve) => setTimeout(resolve, 25))
          activeTransactions -= 1
          return createResult(value)
        }),
      ),
    )

    const entries = await database.all<{ value: number }>(sql`select value from transaction_entry order by value`)
    expect(results).toEqual([createResult(1), createResult(2)])
    expect(maximumActiveTransactions).toBe(1)
    expect(entries).toEqual([{ value: 1 }, { value: 2 }])
  } finally {
    dispose()
  }
})
