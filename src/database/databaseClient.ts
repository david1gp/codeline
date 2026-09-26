import type { Client } from "@libsql/client"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { drizzle, LibSQLTransaction } from "drizzle-orm/libsql"
import type { databaseSchema } from "./databaseSchema.js"

export type DatabaseClient = ReturnType<typeof drizzle<typeof databaseSchema>> & {
  rootTransactionConnectionCreate?: () => DatabaseConnection
}
export type DatabaseTransaction = LibSQLTransaction<
  typeof databaseSchema,
  ExtractTablesWithRelations<typeof databaseSchema>
>
export type DatabaseTransactionHandle = {
  transaction: DatabaseTransaction
  closed: boolean
  commit: () => Promise<void>
  rollback: () => Promise<void>
  close: () => void
}
export type DatabaseExecutor = DatabaseClient | DatabaseTransaction
export type DatabaseConnection = {
  client: Client
  db: DatabaseClient
  transactionCreate?: (mode?: "read" | "write") => Promise<DatabaseTransactionHandle>
  transactionHandles?: Set<DatabaseTransactionHandle>
}
