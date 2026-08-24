import { drizzle, LibSQLSession, LibSQLTransaction } from "drizzle-orm/libsql"
import type { DatabaseClient, DatabaseConnection, DatabaseTransactionHandle } from "./databaseClient.js"
import { databaseSchema } from "./databaseSchema.js"
import { openLibsql } from "./openLibsql.js"

export function databaseConnectionCreate(filePath: string): DatabaseConnection {
  const openedDatabase = openLibsql(filePath)
  const transactionHandles = new Set<DatabaseTransactionHandle>()

  try {
    const db = drizzle(openedDatabase.$client, { schema: databaseSchema }) as DatabaseClient
    db.rootTransactionConnectionCreate = () => databaseConnectionCreate(filePath)
    const transactionCreate = async (mode: "read" | "write" = "write"): Promise<DatabaseTransactionHandle> => {
      let transactionStarted = false
      try {
        await openedDatabase.$client.execute(mode === "read" ? "BEGIN TRANSACTION READONLY" : "BEGIN IMMEDIATE")
        transactionStarted = true
        const databaseInternals = db as unknown as {
          dialect: ConstructorParameters<typeof LibSQLTransaction>[1]
          _: ConstructorParameters<typeof LibSQLTransaction>[3]
        }
        const session = new LibSQLSession(
          openedDatabase.$client,
          databaseInternals.dialect,
          databaseInternals._,
          {},
          undefined,
        )
        const transaction = new LibSQLTransaction("async", databaseInternals.dialect, session, databaseInternals._)

        let transactionHandle: DatabaseTransactionHandle
        transactionHandle = {
          closed: false,
          transaction: transaction as DatabaseTransactionHandle["transaction"],
          commit: async () => {
            await openedDatabase.$client.execute("COMMIT")
          },
          rollback: async () => {
            await openedDatabase.$client.execute("ROLLBACK")
          },
          close: () => {
            if (transactionHandle.closed) return
            openedDatabase.$client.close()
            transactionHandle.closed = true
            transactionHandles.delete(transactionHandle)
          },
        }
        transactionHandles.add(transactionHandle)
        return transactionHandle
      } catch (error: unknown) {
        if (transactionStarted) {
          try {
            await openedDatabase.$client.execute("ROLLBACK")
          } catch (_rollbackError) {
            // The original transaction error is the useful result for callers.
          }
        }
        openedDatabase.$client.close()
        throw error
      }
    }

    return { client: openedDatabase.$client, db, transactionCreate, transactionHandles }
  } catch (error: unknown) {
    openedDatabase.$client.close()
    throw error
  }
}
