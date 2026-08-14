import { index, text, timestamp, unique } from "drizzle-orm/pg-core"
import { applicationUserTable } from "./applicationUserTable.js"
import { identitySchema } from "./identitySchema.js"

export const externalIdentityTable = identitySchema.table(
  "external_identity",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("external_identity_issuer_subject_unique").on(table.issuer, table.subject),
    unique("external_identity_user_issuer_unique").on(table.userId, table.issuer),
    index("external_identity_user_idx").on(table.userId),
  ],
)
