import type { Client } from "@libsql/client"
import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { drizzle, LibSQLTransaction } from "drizzle-orm/libsql"
import type { databaseSchema } from "./databaseSchema.js"

export type DatabaseClient = ReturnType<typeof drizzle<typeof databaseSchema>>
export type DatabaseTransaction = LibSQLTransaction<
  typeof databaseSchema,
  ExtractTablesWithRelations<typeof databaseSchema>
>
export type DatabaseExecutor = DatabaseClient | DatabaseTransaction
export type DatabaseConnection = {
  client: Client
  db: DatabaseClient
}
