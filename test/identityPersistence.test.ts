import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { identitySessionRevoke } from "../src/identity/actions/identitySessionRevoke.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { identitySessionCreate } from "../src/identity/db/identitySessionCreate.js"
import { identitySessionResolve } from "../src/identity/db/identitySessionResolve.js"
import { identitySessionTable } from "../src/identity/db/identitySessionTable.js"
import { oidcLoginTransactionConsume } from "../src/identity/db/oidcLoginTransactionConsume.js"
import { oidcLoginTransactionCreate } from "../src/identity/db/oidcLoginTransactionCreate.js"
import { oidcLoginTransactionTable } from "../src/identity/db/oidcLoginTransactionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const subject = `identity-persistence-${uuidv7()}`
const userId = `development:${subject}`
const sessionId = `identity-session-${uuidv7()}`
const transactionId = `oidc-transaction-${uuidv7()}`

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Identity Persistence Test User",
    identityKey: subject,
  })
  if (!user.success) throw new Error(user.errorMessage)
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(oidcLoginTransactionTable).where(eq(oidcLoginTransactionTable.id, transactionId))
    await database.delete(identitySessionTable).where(eq(identitySessionTable.id, sessionId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  }
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("migration creates a public user table and private identity tables", async () => {
  const tables = await connection.client.execute(
    "select name from sqlite_master where type = 'table' and name in ('identity_external_identity', 'identity_oidc_login_transaction', 'identity_session', 'identity_user') order by name",
  )
  const tableNames = tables.rows.map((row) => ({ name: String(row.name) }))

  expect(tableNames).toEqual([
    { name: "identity_external_identity" },
    { name: "identity_oidc_login_transaction" },
    { name: "identity_session" },
    { name: "identity_user" },
  ])
})

test.skipIf(!databaseAvailable)("development identity backfill preserves the deterministic user ID", async () => {
  const [mapping] = await database
    .select({ userId: databaseSchema.externalIdentityTable.userId })
    .from(databaseSchema.externalIdentityTable)
    .where(eq(databaseSchema.externalIdentityTable.subject, subject))

  expect(mapping).toEqual({ userId })
})

test.skipIf(!databaseAvailable)(
  "development identity upsert reuses an identity inside a root transaction",
  async () => {
    const result = await databaseTransactionRun(database, (transaction) =>
      developmentIdentityUpsert(transaction, {
        displayName: "Identity Persistence Test User",
        identityKey: subject,
      }),
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.id).toBe(userId)
  },
)

test.skipIf(!databaseAvailable)("identity sessions store only a hash of the opaque token", async () => {
  const now = new Date("2026-08-14T12:00:00.000Z")
  const token = `opaque-session-${uuidv7()}`
  const created = await identitySessionCreate(database, {
    id: sessionId,
    userId,
    token,
    expiresAt: new Date("2026-08-14T13:00:00.000Z"),
  })

  expect(created.success).toBe(true)
  if (!created.success) return
  expect(created.data.tokenHash).not.toBe(token)
  expect(created.data.tokenHash).toHaveLength(64)
  const resolved = await identitySessionResolve(database, token, now)
  expect(resolved.success).toBe(true)
  if (!resolved.success) return
  expect(resolved.data?.id).toBe(sessionId)
  const wrongToken = await identitySessionResolve(database, "wrong-token", now)
  expect(wrongToken.success).toBe(true)
  if (!wrongToken.success) return
  expect(wrongToken.data).toBeUndefined()

  const expired = await identitySessionResolve(database, token, new Date("2026-08-14T13:00:00.000Z"))
  expect(expired.success).toBe(true)
  if (!expired.success) return
  expect(expired.data).toBeUndefined()

  const revoked = await identitySessionRevoke(database, sessionId, now)
  expect(revoked.success).toBe(true)
  const repeatedRevoke = await identitySessionRevoke(database, sessionId, new Date("2026-08-14T12:01:00.000Z"))
  expect(repeatedRevoke.success).toBe(true)
  const afterRevoke = await identitySessionResolve(database, token, now)
  expect(afterRevoke.success).toBe(true)
  if (!afterRevoke.success) return
  expect(afterRevoke.data).toBeUndefined()
})

test.skipIf(!databaseAvailable)("OIDC login transactions are hashed and single-use", async () => {
  const now = new Date("2026-08-14T12:00:00.000Z")
  const created = await oidcLoginTransactionCreate(database, {
    id: transactionId,
    issuer: "https://issuer.example.test",
    state: "opaque-state",
    nonce: "opaque-nonce",
    codeVerifier: "pkce-verifier",
    redirectUri: "https://codeline.example.test/callback",
    expiresAt: new Date("2026-08-14T13:00:00.000Z"),
  })

  expect(created.success).toBe(true)
  if (!created.success) return
  expect(created.data.stateHash).not.toBe("opaque-state")
  expect(created.data.nonceHash).not.toBe("opaque-nonce")
  expect("accessToken" in created.data).toBe(false)
  expect("refreshToken" in created.data).toBe(false)
  const consumed = await oidcLoginTransactionConsume(database, "opaque-state", now)
  expect(consumed.success).toBe(true)
  if (!consumed.success) return
  expect(consumed.data?.consumedAt).toEqual(now)
  const reused = await oidcLoginTransactionConsume(database, "opaque-state", now)
  expect(reused.success).toBe(true)
  if (!reused.success) return
  expect(reused.data).toBeUndefined()
})
