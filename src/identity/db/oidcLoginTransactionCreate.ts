import { createHash } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { oidcLoginTransactionTable } from "./oidcLoginTransactionTable.js"

type OidcLoginTransactionInput = {
  browserBinding?: string
  id: string
  issuer: string
  state: string
  nonce: string
  codeVerifier: string
  redirectUri: string
  returnTo?: string
  expiresAt: Date
}

type OidcLoginTransaction = typeof oidcLoginTransactionTable.$inferSelect

export async function oidcLoginTransactionCreate(
  database: Pick<DatabaseClient, "insert">,
  transaction: OidcLoginTransactionInput,
): Promise<Result<OidcLoginTransaction>> {
  const op = "oidcLoginTransactionCreate"

  try {
    const [storedTransaction] = await database
      .insert(oidcLoginTransactionTable)
      .values({
        id: transaction.id,
        issuer: transaction.issuer,
        stateHash: createHash("sha256").update(transaction.state).digest("hex"),
        browserBindingHash: createHash("sha256")
          .update(transaction.browserBinding ?? "")
          .digest("hex"),
        nonceHash: createHash("sha256").update(transaction.nonce).digest("hex"),
        codeVerifier: transaction.codeVerifier,
        redirectUri: transaction.redirectUri,
        returnTo: transaction.returnTo ?? "/",
        expiresAt: transaction.expiresAt,
      })
      .returning()
    if (storedTransaction !== undefined) return createResult(storedTransaction)
    return createResultError(op, "The OIDC login transaction could not be stored.")
  } catch (_error) {
    return createResultError(op, "The OIDC login transaction could not be stored.")
  }
}
