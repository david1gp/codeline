import { createHash } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { and, eq, gt, isNull } from "drizzle-orm"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { oidcLoginTransactionTable } from "./oidcLoginTransactionTable.js"

type OidcLoginTransaction = typeof oidcLoginTransactionTable.$inferSelect

export async function oidcLoginTransactionConsume(
  database: DatabaseExecutor,
  state: string,
  now: Date = new Date(),
  browserBinding?: string,
): Promise<Result<OidcLoginTransaction | undefined>> {
  const op = "oidcLoginTransactionConsume"
  const browserBindingHash =
    browserBinding === undefined ? undefined : createHash("sha256").update(browserBinding).digest("hex")

  try {
    const [consumedTransaction] = await database
      .update(oidcLoginTransactionTable)
      .set({ consumedAt: now })
      .where(
        and(
          eq(oidcLoginTransactionTable.stateHash, createHash("sha256").update(state).digest("hex")),
          ...(browserBindingHash === undefined
            ? []
            : [eq(oidcLoginTransactionTable.browserBindingHash, browserBindingHash)]),
          isNull(oidcLoginTransactionTable.consumedAt),
          gt(oidcLoginTransactionTable.expiresAt, now),
        ),
      )
      .returning()
    return createResult(consumedTransaction)
  } catch (_error) {
    return createResultError(op, "The OIDC login transaction could not be consumed.")
  }
}
