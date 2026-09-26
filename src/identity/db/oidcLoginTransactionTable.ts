import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"

export const oidcLoginTransactionTable = sqliteTable(
  "identity_oidc_login_transaction",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    stateHash: text("state_hash").notNull(),
    browserBindingHash: text("browser_binding_hash").notNull().default(""),
    nonceHash: text("nonce_hash").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    returnTo: text("return_to").notNull().default("/"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).defaultNow().notNull(),
  },
  (table) => [
    unique("oidc_login_transaction_state_hash_unique").on(table.stateHash),
    index("oidc_login_transaction_expires_idx").on(table.expiresAt),
  ],
)
