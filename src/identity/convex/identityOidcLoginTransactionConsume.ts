import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { identitySecretHash } from "./identitySecretHash.js"

type OidcLoginTransaction = {
  _creationTime: number
  _id: string
  browserBindingHash: string
  codeVerifier: string
  consumedAt?: number
  createdAt: number
  expiresAt: number
  id: string
  issuer: string
  nonceHash: string
  redirectUri: string
  returnTo: string
  stateHash: string
}

export async function identityOidcLoginTransactionConsume(
  context: Pick<GenericMutationCtx<any>, "db">,
  state: string,
  now = Date.now(),
  browserBinding?: string,
): Promise<Result<OidcLoginTransaction | undefined>> {
  const op = "identityOidcLoginTransactionConsume"

  try {
    const stateHash = await identitySecretHash(state)
    const browserBindingHash = browserBinding === undefined ? undefined : await identitySecretHash(browserBinding)
    const transaction = await context.db
      .query("oidcLoginTransactions")
      .withIndex("stateHash", (query: any) => query.eq("stateHash", stateHash))
      .first()
    if (transaction === null || transaction.consumedAt !== undefined || transaction.expiresAt <= now) {
      return createResult(undefined)
    }
    if (browserBindingHash !== undefined && transaction.browserBindingHash !== browserBindingHash) {
      return createResult(undefined)
    }
    await context.db.patch("oidcLoginTransactions", transaction._id, { consumedAt: now })
    return createResult({ ...(transaction as OidcLoginTransaction), consumedAt: now })
  } catch (_error) {
    return createResultError(op, "The OIDC login transaction could not be consumed.")
  }
}
