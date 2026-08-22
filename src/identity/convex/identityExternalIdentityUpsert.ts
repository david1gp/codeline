import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { identitySecretHash } from "./identitySecretHash.js"

type ExternalIdentity = {
  _creationTime: number
  _id: string
  createdAt: number
  id: string
  issuer: string
  subject: string
  updatedAt: number
  userId: string
}

type ExternalIdentityInput = {
  issuer: string
  now: number
  subject: string
  userId: string
}

export async function identityExternalIdentityUpsert(
  context: Pick<GenericMutationCtx<any>, "db">,
  input: ExternalIdentityInput,
): Promise<Result<ExternalIdentity>> {
  const op = "identityExternalIdentityUpsert"

  try {
    const existingIdentity = await context.db
      .query("externalIdentities")
      .withIndex("issuerSubject", (query: any) => query.eq("issuer", input.issuer).eq("subject", input.subject))
      .first()
    if (existingIdentity !== null) {
      if (existingIdentity.userId !== input.userId) {
        return createResultError(op, "The external identity is already linked to another user.")
      }
      return createResult(existingIdentity as ExternalIdentity)
    }

    const existingUserIssuer = await context.db
      .query("externalIdentities")
      .withIndex("userIssuer", (query: any) => query.eq("userId", input.userId).eq("issuer", input.issuer))
      .first()
    if (existingUserIssuer !== null && existingUserIssuer.subject !== input.subject) {
      return createResultError(op, "The user already has an identity for this issuer.")
    }

    const id = `external:${await identitySecretHash(`${input.issuer}\0${input.subject}`)}`
    const documentId = await context.db.insert("externalIdentities", {
      id,
      userId: input.userId,
      issuer: input.issuer,
      subject: input.subject,
      createdAt: input.now,
      updatedAt: input.now,
    })
    return createResult({
      _creationTime: input.now,
      _id: documentId,
      createdAt: input.now,
      id,
      issuer: input.issuer,
      subject: input.subject,
      updatedAt: input.now,
      userId: input.userId,
    })
  } catch (_error) {
    return createResultError(op, "The external identity could not be stored.")
  }
}
