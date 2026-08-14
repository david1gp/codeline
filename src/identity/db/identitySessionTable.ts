import { index, text, timestamp, unique } from "drizzle-orm/pg-core"
import { applicationUserTable } from "./applicationUserTable.js"
import { identitySchema } from "./identitySchema.js"

export const identitySessionTable = identitySchema.table(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    unique("identity_session_token_hash_unique").on(table.tokenHash),
    index("identity_session_user_expires_idx").on(table.userId, table.expiresAt),
  ],
)
