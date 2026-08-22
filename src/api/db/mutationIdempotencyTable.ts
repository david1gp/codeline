import { index, integer, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core"
import { applicationUserTable } from "../../identity/db/applicationUserTable.js"

export const mutationIdempotencyTable = pgTable(
  "mutation_idempotency",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    resourceId: text("resource_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: integer("status").notNull(),
    responseBody: jsonb("response_body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("mutation_idempotency_user_operation_key_unique").on(table.userId, table.operation, table.idempotencyKey),
    index("mutation_idempotency_user_resource_idx").on(table.userId, table.resourceId),
  ],
)
