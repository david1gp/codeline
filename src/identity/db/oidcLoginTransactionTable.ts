import { index, text, timestamp, unique } from "drizzle-orm/pg-core"
import { identitySchema } from "./identitySchema.js"

export const oidcLoginTransactionTable = identitySchema.table(
  "oidc_login_transaction",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    stateHash: text("state_hash").notNull(),
    browserBindingHash: text("browser_binding_hash").notNull().default(""),
    nonceHash: text("nonce_hash").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    returnTo: text("return_to").notNull().default("/"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("oidc_login_transaction_state_hash_unique").on(table.stateHash),
    index("oidc_login_transaction_expires_idx").on(table.expiresAt),
  ],
)
