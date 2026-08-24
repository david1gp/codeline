import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import { appCreate } from "../src/app/appCreate.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseUrl } from "../src/database/databaseUrl.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { serverListResponseSchema } from "../src/servers/api/serverListResponseSchema.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  organizationExternalId: `server-api-external-${uuidv7()}`,
  organizationId: `server-api-organization-${uuidv7()}`,
  serverId: `server-api-server-${uuidv7()}`,
  userKey: `server-api-user-${uuidv7()}`,
}
let userId: string | undefined

const app = appCreate({
  configuration: {
    authMode: "development",
    databaseUrl,
    developmentIdentity: { displayName: "Server API User", identityKey: fixture.userKey },
    nodeEnv: "development",
    oidcOrganizationId: fixture.organizationExternalId,
  },
  database,
  projectRootDirs: [],
})

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Server API User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(organizationTable).values({
    externalId: fixture.organizationExternalId,
    id: fixture.organizationId,
    name: "Server API Organization",
  })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: fixture.organizationId,
    subject: fixture.userKey,
    userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://server-api.test",
    id: fixture.serverId,
    name: "Server API",
    organizationId: fixture.organizationId,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database
      .delete(organizationMemberTable)
      .where(eq(organizationMemberTable.organizationId, fixture.organizationId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
    if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  }
  await databaseConnectionClose(connection)
})

test("server reads require authentication", async () => {
  const unauthenticatedApp = appCreate({ database, projectRootDirs: [] })
  const response = await unauthenticatedApp.request("/api/servers")
  expect(response.status).toBe(401)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
})

test.skipIf(!databaseAvailable)("server list responses are typed and conditionally cacheable", async () => {
  const first = await app.request("/api/servers")
  expect(first.status).toBe(200)
  expect(first.headers.get("Cache-Control")).toBe("private, no-cache")
  expect(first.headers.get("Vary")).toBe("Cookie, Accept-Encoding")

  const body: unknown = await first.json()
  const parsed = v.safeParse(serverListResponseSchema, body)
  expect(parsed.success).toBe(true)
  if (!parsed.success) return
  expect(first.headers.get("ETag")).toBe(parsed.output.etag)
  expect(parsed.output.revision).toBeInteger()
  expect(parsed.output.schemaVersion).toBe("server-list-v1")
  expect(parsed.output.servers).toEqual([{ id: fixture.serverId, name: "Server API" }])

  const notModified = await app.request("/api/servers", {
    headers: { "If-None-Match": parsed.output.etag },
  })
  expect(notModified.status).toBe(304)
  expect(notModified.headers.get("Cache-Control")).toBe("private, no-cache")
  expect(notModified.headers.get("ETag")).toBe(parsed.output.etag)
})
