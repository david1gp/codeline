import { expect, test } from "bun:test"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { healthResponseSchema } from "../src/api/health/healthResponseSchema.js"
import { readinessResponseSchema } from "../src/api/readiness/readinessResponseSchema.js"
import { appCreate } from "../src/app/appCreate.js"
import { runtimeConfigurationParse } from "../src/configuration/runtimeConfigurationParse.js"
import { developmentUserUpsert } from "../src/database/repository/developmentUserUpsert.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { serverStart } from "../src/server/serverStart.js"

const configuration = runtimeConfigurationParse({
  databaseUrl: "postgres://codeline:local@127.0.0.1:5432/codeline",
  developmentIdentity: {
    email: "developer@example.test",
    identityKey: "configured-developer",
    displayName: "Configured Developer",
  },
  nodeEnv: "development",
})

test("runtime configuration rejects missing development identity without exposing values", () => {
  const result = runtimeConfigurationParse({
    databaseUrl: "postgres://secret:password@127.0.0.1:5432/codeline",
    nodeEnv: "development",
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("developmentIdentity")
  expect(result.errorMessage).not.toContain("secret")
  expect(result.errorMessage).not.toContain("password")
})

test("app construction remains database-free for unit tests", async () => {
  const app = appCreate()
  const response = await app.request("http://codeline.test/health")

  expect(response.status).toBe(200)
  expect(v.safeParse(healthResponseSchema, await response.json()).success).toBe(true)
})

test("readiness uses the injected database check and does not expose connection details", async () => {
  const app = appCreate({ databaseReadyCheck: async () => ({ success: true, data: undefined }) })
  const response = await app.request("http://codeline.test/ready")
  const body = await response.json()

  expect(response.status).toBe(503)
  expect(v.safeParse(apiErrorResponseSchema, body).success).toBe(true)
  expect(JSON.stringify(body)).not.toContain("postgres")
})

test("readiness reports ready only when an injected database is ready", async () => {
  const app = appCreate({
    database: {} as never,
    databaseReadyCheck: async () => ({ success: true, data: undefined }),
  })
  const response = await app.request("http://codeline.test/ready")
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(v.safeParse(readinessResponseSchema, body).success).toBe(true)
})

test("development identity middleware stores only the configured identity", async () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)
  let capturedIdentity: unknown
  const fakeDatabase = {
    transaction: async (operation: (transaction: unknown) => Promise<unknown>) =>
      operation({
        insert: () => ({
          values: (value: unknown) => {
            capturedIdentity = value
            return {
              onConflictDoUpdate: () => ({ returning: async () => [{ id: "development:configured-developer" }] }),
            }
          },
        }),
      }),
  }
  const user = {
    id: "development:configured-developer",
    identityKey: "configured-developer",
    displayName: "Configured Developer",
    email: "developer@example.test",
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  const app = appCreate({
    configuration: configuration.data,
    database: fakeDatabase as never,
    databaseReadyCheck: async () => ({ success: true, data: undefined }),
  })
  const response = await app.request("http://codeline.test/api/testing/echo", {
    body: JSON.stringify({ message: "hello", ownerUserId: "client-controlled-owner" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(200)
  expect(capturedIdentity).toMatchObject({
    email: user.email,
    identityKey: user.identityKey,
    displayName: user.displayName,
  })
  expect(JSON.stringify(capturedIdentity)).not.toContain("client-controlled-owner")
})

test("development identity repository safely returns an error when its database operation fails", async () => {
  const result = await developmentUserUpsert(
    {
      insert: () => {
        throw new Error("database unavailable")
      },
    } as never,
    {
      identityKey: "configured-developer",
      displayName: "Configured Developer",
    },
  )

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toBe("The development identity could not be stored.")
})

test("database client close is idempotent", async () => {
  let closeCount = 0
  const connection = {
    client: {
      end: async () => {
        closeCount += 1
      },
    },
    db: {},
  } as never

  const first = databaseConnectionClose(connection)
  const second = databaseConnectionClose(connection)

  expect(first).toBe(second)
  expect((await first).success).toBe(true)
  expect((await second).success).toBe(true)
  expect(closeCount).toBe(1)
})

test("server shutdown stops the server and closes the injected database once", async () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)
  const listeners = new Map<string, () => void>()
  let stopCount = 0
  let closeCount = 0
  const database = {
    client: { end: async () => void (closeCount += 1) },
    db: {},
  } as never
  const server = serverStart({
    appCreate: () => appCreate(),
    configuration: configuration.data,
    database,
    serve: () => ({
      stop: async () => void (stopCount += 1),
      url: new URL("http://codeline.test"),
    }),
    signalSource: {
      once: (signal, listener) => void listeners.set(signal, listener),
      removeListener: (signal) => void listeners.delete(signal),
    },
  })

  expect(server.url.toString()).toBe("http://codeline.test/")
  listeners.get("SIGTERM")?.()
  listeners.get("SIGINT")?.()
  await Bun.sleep(0)

  expect(stopCount).toBe(1)
  expect(closeCount).toBe(1)
})
