import type { ExtractTablesWithRelations } from "drizzle-orm"
import type { PgTransaction } from "drizzle-orm/pg-core"
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js"
import type { drizzle } from "drizzle-orm/postgres-js"
import type postgres from "postgres"
import type { databaseSchema } from "./schema/databaseSchema.js"

export type DatabaseClient = ReturnType<typeof drizzle<typeof databaseSchema>>
export type DatabaseTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof databaseSchema,
  ExtractTablesWithRelations<typeof databaseSchema>
>
export type DatabaseExecutor = DatabaseClient | DatabaseTransaction
export type DatabaseConnection = {
  client: ReturnType<typeof postgres>
  db: DatabaseClient
}
