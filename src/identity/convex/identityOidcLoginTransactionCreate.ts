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

type OidcLoginTransactionInput = {
  browserBinding?: string
  codeVerifier: string
  expiresAt: number
  id: string
  issuer: string
  nonce: string
  now: number
  redirectUri: string
  returnTo?: string
  state: string
}

export async function identityOidcLoginTransactionCreate(
  context: Pick<GenericMutationCtx<any>, "db">,
  input: OidcLoginTransactionInput,
): Promise<Result<OidcLoginTransaction>> {
  const op = "identityOidcLoginTransactionCreate"

  try {
    const stateHash = await identitySecretHash(input.state)
    const existingTransaction = await context.db
      .query("oidcLoginTransactions")
      .withIndex("stateHash", (query: any) => query.eq("stateHash", stateHash))
      .first()
    if (existingTransaction !== null) return createResultError(op, "The OIDC login state is already in use.")

    const browserBindingHash = await identitySecretHash(input.browserBinding ?? "")
    const nonceHash = await identitySecretHash(input.nonce)
    const documentId = await context.db.insert("oidcLoginTransactions", {
      id: input.id,
      issuer: input.issuer,
      stateHash,
      browserBindingHash,
      nonceHash,
      codeVerifier: input.codeVerifier,
      redirectUri: input.redirectUri,
      returnTo: input.returnTo ?? "/",
      expiresAt: input.expiresAt,
      createdAt: input.now,
    })
    return createResult({
      _creationTime: input.now,
      _id: documentId,
      browserBindingHash,
      codeVerifier: input.codeVerifier,
      createdAt: input.now,
      expiresAt: input.expiresAt,
      id: input.id,
      issuer: input.issuer,
      nonceHash,
      redirectUri: input.redirectUri,
      returnTo: input.returnTo ?? "/",
      stateHash,
    })
  } catch (_error) {
    return createResultError(op, "The OIDC login transaction could not be stored.")
  }
}
