import { createResult, createResultError } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import type { MiddlewareHandler } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { applicationUserRepositoryLoad } from "../db/applicationUserRepositoryLoad.js"
import { organizationMemberTable } from "../db/organizationMemberTable.js"
import { type LocalIdentityPolicy, localIdentityPolicySchema } from "../localIdentityPolicySchema.js"

export function localAuthenticationMiddleware(
  database: DatabaseClient | undefined,
  policy: LocalIdentityPolicy,
): MiddlewareHandler<AppEnvironment> {
  // Snapshot the injected policy so callers cannot change identities after composition.
  const parsed = v.safeParse(localIdentityPolicySchema, policy)
  return async (context, next) => {
    if (database !== undefined) context.set("database", database)
    if (context.req.path === "/api/health" || context.req.path === "/api/ready") return next()

    const identity =
      parsed.success && database !== undefined ? await localRequestIdentityLoad(database, parsed.output) : undefined
    if (identity === undefined || !identity.success || identity.data === undefined) {
      const response = {
        error: { code: "unauthorized", message: "Authentication is required." },
      } satisfies ApiErrorResponse
      context.header("Cache-Control", "no-store")
      return context.json(response, 401)
    }

    context.set("requestIdentity", identity.data)
    return next()
  }
}

async function localRequestIdentityLoad(database: DatabaseClient, policy: LocalIdentityPolicy) {
  const op = "localRequestIdentityLoad"
  const user = await applicationUserRepositoryLoad(database, policy.userId)
  if (!user.success) return user
  if (user.data === undefined || user.data.id !== policy.userId) return createResult(undefined)

  try {
    const membership = await database.query.organizationMemberTable.findFirst({
      where: and(
        eq(organizationMemberTable.userId, policy.userId),
        eq(organizationMemberTable.organizationId, policy.organizationId),
      ),
    })
    if (membership?.userId !== policy.userId || membership.organizationId !== policy.organizationId)
      return createResult(undefined)

    return createResult({ ...policy, displayName: user.data.displayName })
  } catch (_error) {
    return createResultError(op, "The local identity membership could not be loaded.")
  }
}
