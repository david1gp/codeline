import { index, pgTable, primaryKey, text, timestamp, unique } from "drizzle-orm/pg-core"
import { applicationUserTable } from "./applicationUserTable.js"
import { organizationTable } from "./organizationTable.js"

export const organizationMemberTable = pgTable(
  "organization_member",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => applicationUserTable.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.userId], name: "organization_member_pkey" }),
    unique("organization_member_identity_unique").on(table.organizationId, table.issuer, table.subject),
    index("organization_member_user_idx").on(table.userId),
  ],
)

export type OrganizationMember = typeof organizationMemberTable.$inferSelect
