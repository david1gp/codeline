import { expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readlinkSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createResult, createResultError } from "@adaptive-ds/result"
import { sql } from "drizzle-orm"
import { LibSQLTransaction } from "drizzle-orm/libsql"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseExecutorTransactionRun } from "../src/database/databaseExecutorTransactionRun.js"
import { databaseReadTransactionRun } from "../src/database/databaseReadTransactionRun.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"

function temporaryDatabaseCreate() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "codeline-transaction-"))
  const connection = databaseConnectionCreate(path.join(directory, "database.sqlite"))

  return {
    database: connection.db,
    dispose: () => {
      connection.client.close()
      rmSync(directory, { force: true, recursive: true })
    },
  }
}

function transactionConnectionCreate(options: { setupError?: unknown; transactionCloseError?: unknown }) {
  let clientCloseCount = 0
  let transactionCloseCount = 0
  let transactionCloseAttemptCount = 0
  let commitCount = 0
  let rollbackCount = 0
  const nativeTransaction = {
    closed: false,
    close: () => {
      transactionCloseAttemptCount += 1
      if (options.transactionCloseError !== undefined) throw options.transactionCloseError
      if (!nativeTransaction.closed) {
        nativeTransaction.closed = true
        transactionCloseCount += 1
      }
    },
  }
  const transactionHandles = new Set<typeof nativeTransaction>()
  const connection = {
    client: {
      execute: async () => {
        if (options.setupError !== undefined) throw options.setupError
        return {}
      },
      close: () => {
        clientCloseCount += 1
      },
    },
    db: {},
    transactionHandles,
    transactionCreate: async () => {
      transactionHandles.add(nativeTransaction)
      return {
        transaction: {
          run: async () => undefined,
        },
        commit: async () => {
          commitCount += 1
        },
        rollback: async () => {
          rollbackCount += 1
        },
        close: () => nativeTransaction.close(),
      }
    },
  }
  const database = {
    rootTransactionConnectionCreate: () => connection,
  }

  return {
    database,
    counts: {
      get clientClose() {
        return clientCloseCount
      },
      get commit() {
        return commitCount
      },
      get rollback() {
        return rollbackCount
      },
      get transactionClose() {
        return transactionCloseCount
      },
      get transactionCloseAttempts() {
        return transactionCloseAttemptCount
      },
    },
  }
}

function databaseFileDescriptorCount(filePath: string): number {
  return readdirSync("/proc/self/fd").reduce((count, descriptor) => {
    try {
      return readlinkSync(`/proc/self/fd/${descriptor}`) === filePath ? count + 1 : count
    } catch (_error) {
      return count
    }
  }, 0)
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

test("database transactions retain relational metadata and nested savepoints", async () => {
  const { database, dispose } = temporaryDatabaseCreate()
  try {
    const result = await databaseTransactionRun(database as never, async (transaction) => {
      expect(transaction.query.applicationUserTable).toBeDefined()
      const nestedResult = await transaction.transaction(async (nested) => {
        await nested.run(sql`select 1`)
        return "nested"
      })
      return createResult(nestedResult)
    })
    expect(result).toEqual(createResult("nested"))
  } finally {
    dispose()
  }
})

test.skipIf(process.platform !== "linux")(
  "root transactions release owned SQLite resources on commit and rollback",
  async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "codeline-transaction-resource-"))
    const filePath = path.join(directory, "database.sqlite")
    const connection = databaseConnectionCreate(filePath)

    try {
      await connection.client.execute("select 1")
      const initialDescriptorCount = databaseFileDescriptorCount(filePath)

      for (let index = 0; index < 5; index += 1) {
        const committed = await databaseTransactionRun(connection.db, async (transaction) => {
          await transaction.run(sql`select 1`)
          return createResult(index)
        })
        expect(committed).toEqual(createResult(index))
      }

      for (let index = 0; index < 5; index += 1) {
        const rolledBack = await databaseTransactionRun(connection.db, async () =>
          createResultError("resourceProbe", `rollback-${index}`),
        )
        expect(rolledBack).toEqual(createResultError("resourceProbe", `rollback-${index}`))
      }

      for (let index = 0; index < 5; index += 1) {
        const read = await databaseReadTransactionRun(connection.db, async (transaction) => {
          await transaction.run(sql`select 1`)
          return createResult(index)
        })
        expect(read).toEqual(createResult(index))
      }

      Bun.gc(true)
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(databaseFileDescriptorCount(filePath)).toBe(initialDescriptorCount)
    } finally {
      connection.client.close()
      rmSync(directory, { force: true, recursive: true })
    }
  },
)

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

test("database transaction closes the root client and native transaction after commit", async () => {
  const fixture = transactionConnectionCreate({})

  const result = await databaseTransactionRun(fixture.database as never, async () => createResult("committed"))

  expect(result).toEqual(createResult("committed"))
  expect(fixture.counts.commit).toBe(1)
  expect(fixture.counts.rollback).toBe(0)
  expect(fixture.counts.transactionClose).toBe(1)
  expect(fixture.counts.clientClose).toBe(1)
})

test("database transaction rolls back and closes handles when the callback throws", async () => {
  const fixture = transactionConnectionCreate({})

  const result = await databaseTransactionRun(fixture.database as never, async () => {
    throw new Error("callback failed")
  })

  expect(result).toEqual(createResultError("databaseTransactionRun", "The database transaction failed."))
  expect(fixture.counts.commit).toBe(0)
  expect(fixture.counts.rollback).toBe(1)
  expect(fixture.counts.transactionClose).toBe(1)
  expect(fixture.counts.clientClose).toBe(1)
})

test("database transaction preserves the primary error when cleanup fails", async () => {
  const fixture = transactionConnectionCreate({ transactionCloseError: new Error("transaction close failed") })
  const primaryError = createResultError("domainOperation", "The domain operation failed.")

  const result = await databaseTransactionRun(fixture.database as never, async () => primaryError)

  expect(result).toEqual(primaryError)
  expect(fixture.counts.rollback).toBe(1)
  expect(fixture.counts.transactionCloseAttempts).toBe(2)
  expect(fixture.counts.clientClose).toBe(1)
})

test("database transaction does not rerun a callback that fails with SQLITE_BUSY", async () => {
  const fixture = transactionConnectionCreate({})
  let callbackCount = 0

  const result = await databaseTransactionRun(fixture.database as never, async () => {
    callbackCount += 1
    throw { code: "SQLITE_BUSY" }
  })

  expect(result).toEqual(createResultError("databaseTransactionRun", "The database transaction failed."))
  expect(callbackCount).toBe(1)
  expect(fixture.counts.rollback).toBe(1)
})

test("database transaction returns a Result error when root connection creation fails", async () => {
  let callbackCount = 0
  const database = {
    rootTransactionConnectionCreate: () => {
      throw new Error("cannot create connection")
    },
  }

  const result = await databaseTransactionRun(database as never, async () => {
    callbackCount += 1
    return createResult("unreachable")
  })

  expect(result).toEqual(createResultError("databaseTransactionRun", "The database transaction failed."))
  expect(callbackCount).toBe(0)
})

test("database read transaction returns a Result error when root connection creation fails", async () => {
  let callbackCount = 0
  const database = {
    rootTransactionConnectionCreate: () => {
      throw new Error("cannot create connection")
    },
  }

  const result = await databaseReadTransactionRun(database as never, async () => {
    callbackCount += 1
    return createResult("unreachable")
  })

  expect(result).toEqual(createResultError("databaseReadTransactionRun", "The database read transaction failed."))
  expect(callbackCount).toBe(0)
})

test("database transaction returns a Result error when root setup fails", async () => {
  const fixture = transactionConnectionCreate({ setupError: new Error("cannot configure connection") })

  const result = await databaseTransactionRun(fixture.database as never, async () => createResult("unreachable"))

  expect(result).toEqual(createResultError("databaseTransactionRun", "The database transaction failed."))
  expect(fixture.counts.transactionClose).toBe(0)
  expect(fixture.counts.clientClose).toBe(1)
})

test("database transactions use separate root connections without an in-process queue", async () => {
  const rootConnectionIds: number[] = []
  let nextRootConnectionId = 1
  let activeCallbacks = 0
  let maximumActiveCallbacks = 0
  let callbackCount = 0
  let releaseCallbacks: () => void = () => undefined
  const callbacksReleased = new Promise<void>((resolve) => {
    releaseCallbacks = resolve
  })
  let callbacksReady: () => void = () => undefined
  const bothCallbacksStarted = new Promise<void>((resolve) => {
    callbacksReady = resolve
  })

  const database = {
    rootTransactionConnectionCreate: () => {
      const rootConnectionId = nextRootConnectionId
      nextRootConnectionId += 1
      rootConnectionIds.push(rootConnectionId)
      const nativeTransaction = {
        closed: false,
        close: () => {
          nativeTransaction.closed = true
        },
      }
      const transactionHandles = new Set<typeof nativeTransaction>()
      return {
        client: {
          execute: async () => ({}),
          close: () => undefined,
        },
        db: {},
        transactionHandles,
        transactionCreate: async () => {
          transactionHandles.add(nativeTransaction)
          return {
            transaction: { run: async () => undefined },
            commit: async () => undefined,
            rollback: async () => undefined,
            close: () => nativeTransaction.close(),
          }
        },
      }
    },
  }

  const run = (value: number) =>
    databaseTransactionRun(database as never, async () => {
      callbackCount += 1
      activeCallbacks += 1
      maximumActiveCallbacks = Math.max(maximumActiveCallbacks, activeCallbacks)
      if (callbackCount === 2) callbacksReady()
      try {
        await callbacksReleased
        return createResult(value)
      } finally {
        activeCallbacks -= 1
      }
    })

  const first = run(1)
  const second = run(2)
  const callbacksOverlap = await Promise.race([
    bothCallbacksStarted.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
  ])
  releaseCallbacks()
  const results = await Promise.all([first, second])

  expect(callbacksOverlap).toBe(true)
  expect(rootConnectionIds).toEqual([1, 2])
  expect(maximumActiveCallbacks).toBe(2)
  expect(results).toEqual([createResult(1), createResult(2)])
})
