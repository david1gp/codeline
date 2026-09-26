import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { applicationUserTable } from "./applicationUserTable.js"

export const identitySessionTable = sqliteTable(
  "identity_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    unique("identity_session_token_hash_unique").on(table.tokenHash),
    index("identity_session_user_expires_idx").on(table.userId, table.expiresAt),
  ],
)
