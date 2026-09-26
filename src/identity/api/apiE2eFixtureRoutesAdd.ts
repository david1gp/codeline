import { createHash, timingSafeEqual } from "node:crypto"
import { dirname } from "node:path"
import { Hono, type Context } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import type { RuntimeConfiguration } from "../../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { e2eFixtureRunOperate } from "../actions/e2eFixtureRunOperate.js"
import { e2eSampleSessionsOperate } from "../actions/e2eSampleSessionsOperate.js"
import { e2eSampleProjectPathsOperate } from "../actions/e2eSampleProjectPathsOperate.js"
import { e2eFixtureRunTable } from "../db/e2eFixtureRunTable.js"
import { eq } from "drizzle-orm"
import { createResult, createResultError } from "@adaptive-ds/result"
import { e2eSampleSessionsTable } from "../db/e2eSampleSessionsTable.js"
import { oidcIssuerCanonicalize } from "../oidc/oidcIssuerCanonicalize.js"
import { e2eFixtureExpiredRunsList } from "../actions/e2eFixtureExpiredRunsList.js"
import { e2eFixtureDiagnosticsRead } from "../actions/e2eFixtureDiagnosticsRead.js"

const runIdSchema = v.pipe(v.string(), v.regex(/^[0-9a-z]{6,40}$/))
const issueSchema = v.strictObject({ runId: runIdSchema })
const expireSchema = v.strictObject({ userId: v.string() })

/** Mounted before cookie authentication; this route accepts only its dedicated server-side bearer secret. */
export function apiE2eFixtureRoutesAdd(
  app: Hono<AppEnvironment>,
  options: { configuration: RuntimeConfiguration; database: DatabaseClient; token?: string; now?: () => Date },
): void {
  const token = options.token
  const issuerValue = options.configuration.oidcIssuer ?? options.configuration.oidcProviders?.authworks?.issuer
  const issuer = issuerValue === undefined ? undefined : oidcIssuerCanonicalize(issuerValue)
  const organizationExternalId = options.configuration.oidcOrganizationId
  if (
    token === undefined ||
    token.length < 32 ||
    issuer === undefined ||
    !issuer.success ||
    organizationExternalId === undefined ||
    organizationExternalId.length === 0
  )
    return

  const expected = createHash("sha256").update(token).digest()
  const routes = new Hono<AppEnvironment>()
  routes.use("*", async (context, next) => {
    context.header("Cache-Control", "no-store")
    const authorization = context.req.header("Authorization")
    const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : ""
    const actual = createHash("sha256").update(supplied).digest()
    if (supplied.length === 0 || !timingSafeEqual(expected, actual))
      return context.json(
        { error: { code: "fixtures.unauthorized", message: "Fixture authorization is required." } },
        401,
      )
    return next()
  })

  routes.post("/runs", async (context) => {
    let body: unknown
    try {
      body = await context.req.json()
    } catch (_error) {
      return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid fixture request." } }, 400)
    }
    const parsed = v.safeParse(issueSchema, body)
    if (!parsed.success)
      return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid fixture request." } }, 400)
    const result = await e2eFixtureRunOperate(
      options.database,
      { issuer: issuer.data, organizationExternalId },
      parsed.output.runId,
      "issue",
    )
    if (!result.success)
      return context.json({ error: { code: "fixtures.conflict", message: result.errorMessage } }, 409)
    return context.json(result.data, 201)
  })

  routes.get("/runs/expired", async (context) => {
    const result = await e2eFixtureExpiredRunsList(
      options.database,
      { issuer: issuer.data, organizationExternalId },
      options.now?.() ?? new Date(),
    )
    if (!result.success)
      return context.json({ error: { code: "fixtures.conflict", message: result.errorMessage } }, 409)
    return context.json(result.data)
  })

  routes.get("/runs/:runId/diagnostics", async (context) => {
    const parsed = v.safeParse(runIdSchema, context.req.param("runId"))
    if (!parsed.success)
      return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid run identifier." } }, 400)
    const result = await e2eFixtureDiagnosticsRead(
      options.database,
      { issuer: issuer.data, organizationExternalId },
      parsed.output,
    )
    if (!result.success)
      return context.json({ error: { code: "fixtures.conflict", message: result.errorMessage } }, 409)
    return context.json(result.data)
  })

  for (const method of ["GET", "POST"] as const) {
    const handler = async (context: Context<AppEnvironment>) => {
      const parsed = v.safeParse(runIdSchema, context.req.param("runId"))
      if (!parsed.success)
        return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid run identifier." } }, 400)
      if (method === "POST" && (await context.req.text()).length !== 0)
        return context.json(
          { error: { code: "fixtures.invalid-input", message: "Sample fixture takes no body." } },
          400,
        )
      const createdPaths: string[] = []
      const result = await databaseTransactionRun(options.database, async (transaction) => {
        // Status performs no post-commit work; check identity inside the same transaction as sample ownership.
        const verified = await e2eFixtureRunOperate(
          transaction,
          { issuer: issuer.data, organizationExternalId },
          parsed.output,
          "status",
        )
        if (!verified.success) return verified
        if (!verified.data.exists)
          return createResultError("e2eSampleSessionsOperate", "The fixture run does not exist.")
        const [run] = await transaction
          .select()
          .from(e2eFixtureRunTable)
          .where(eq(e2eFixtureRunTable.runId, parsed.output))
        if (
          run === undefined ||
          run.issuer !== issuer.data ||
          run.organizationExternalId !== organizationExternalId ||
          run.firstUserId !== verified.data.userIds?.[0]
        )
          return { success: false as const, op: "e2eSampleSessionsOperate", errorMessage: "Fixture ownership changed." }
        const [existing] = await transaction
          .select()
          .from(e2eSampleSessionsTable)
          .where(eq(e2eSampleSessionsTable.runId, run.runId))
        const sample = await e2eSampleSessionsOperate(
          transaction,
          run,
          method === "POST" ? "issue" : "status",
          new Date(),
          createdPaths,
        )
        if (!sample.success) return sample
        return createResult({ ...sample.data, created: method === "POST" && existing === undefined })
      })
      if (!result.success && createdPaths.length > 0) {
        // A failed database transaction must not leave newly allocated directories behind.
        const mapping = Object.fromEntries(createdPaths.map((target) => [`path:${dirname(target)}`, target]))
        const rolledBack = await e2eSampleProjectPathsOperate(parsed.output, mapping, "rollback", createdPaths)
        if (!rolledBack.success)
          return context.json({ error: { code: "fixtures.conflict", message: rolledBack.errorMessage } }, 409)
      }
      if (!result.success)
        return context.json({ error: { code: "fixtures.conflict", message: result.errorMessage } }, 409)
      const { created, ...data } = result.data
      return context.json(data, created ? 201 : 200)
    }
    if (method === "POST") routes.post("/runs/:runId/sample-sessions", handler)
    if (method === "GET") routes.get("/runs/:runId/sample-sessions", handler)
  }

  for (const operation of ["status", "expire", "prune-journal", "purge"] as const) {
    const path = operation === "status" ? "/runs/:runId" : `/runs/:runId/${operation}`
    const handler = async (context: Context<AppEnvironment>) => {
      const parsed = v.safeParse(runIdSchema, context.req.param("runId"))
      if (!parsed.success)
        return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid run identifier." } }, 400)
      let userId: string | undefined
      if (
        (operation === "expire" || operation === "prune-journal") &&
        context.req.header("Content-Type")?.includes("application/json")
      ) {
        let raw: string
        try {
          raw = await context.req.text()
        } catch (_error) {
          return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid member request." } }, 400)
        }
        if (raw.length !== 0) {
          let body: unknown
          try {
            body = JSON.parse(raw) as unknown
          } catch (_error) {
            return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid member request." } }, 400)
          }
          const input = v.safeParse(expireSchema, body)
          if (!input.success)
            return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid member request." } }, 400)
          userId = input.output.userId
        }
      }
      if (
        operation === "prune-journal" &&
        !context.req.header("Content-Type")?.includes("application/json") &&
        (await context.req.text()).length !== 0
      )
        return context.json({ error: { code: "fixtures.invalid-input", message: "Invalid member request." } }, 400)
      const result = await e2eFixtureRunOperate(
        options.database,
        { issuer: issuer.data, organizationExternalId },
        parsed.output,
        operation,
        new Date(),
        userId,
      )
      if (!result.success)
        return context.json({ error: { code: "fixtures.conflict", message: result.errorMessage } }, 409)
      return context.json(result.data)
    }
    if (operation === "status") routes.get(path, handler)
    if (operation === "expire") routes.post(path, handler)
    if (operation === "prune-journal") routes.post(path, handler)
    if (operation === "purge") routes.delete("/runs/:runId", handler)
  }
  app.route("/api/_e2e/fixtures", routes)
}
