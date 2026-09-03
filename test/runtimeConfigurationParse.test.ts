import { expect, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { healthResponseSchema } from "../src/api/health/healthResponseSchema.js"
import { readinessResponseSchema } from "../src/api/readiness/readinessResponseSchema.js"
import { appCreate } from "../src/app/appCreate.js"
import { runtimeConfigurationParse } from "../src/configuration/runtimeConfigurationParse.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { journalEventsPruneSchedulerCreate } from "../src/journal/actions/journalEventsPruneSchedulerCreate.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { serverStart } from "../src/server/serverStart.js"

const configuration = runtimeConfigurationParse({
  authMode: "development",
  databaseUrl: "file:./data/db.sqlite",
  developmentIdentity: {
    email: "developer@example.test",
    identityKey: "configured-developer",
    displayName: "Configured Developer",
  },
  nodeEnv: "development",
  oidcOrganizationId: "configured-organization",
  publicOrigin: "http://127.0.0.1:6000",
})

test("runtime configuration rejects missing development identity without exposing values", () => {
  const result = runtimeConfigurationParse({
    authMode: "development",
    databaseUrl: "file:./data/db.sqlite",
    nodeEnv: "development",
    publicOrigin: "http://127.0.0.1:6000",
  })

  expect(result.success).toBe(false)
  if (result.success) return
  expect(result.errorMessage).toContain("developmentIdentity")
  expect(result.errorMessage).not.toContain("secret")
  expect(result.errorMessage).not.toContain("password")
})

test("runtime configuration defaults the sessions sidebar page size", () => {
  expect(configuration.success).toBe(true)
  if (configuration.success) expect(configuration.data.sessionsSidebarPageSize).toBe(25)
})

test("runtime configuration accepts a positive integer sessions sidebar page size from the server environment", () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)
  const result = runtimeConfigurationParse({
    ...configuration.data,
    sessionsSidebarPageSize: undefined,
    SESSIONS_SIDEBAR_PAGE_SIZE: "40",
  })

  expect(result.success).toBe(true)
  if (result.success) expect(result.data.sessionsSidebarPageSize).toBe(40)
})

test("runtime configuration rejects non-positive and non-integer sessions sidebar page sizes", () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)
  for (const pageSize of [0, -1, 1.5, "", "  ", "1.5", "Infinity", "NaN", "not-a-number"]) {
    const result = runtimeConfigurationParse({
      ...configuration.data,
      sessionsSidebarPageSize: undefined,
      SESSIONS_SIDEBAR_PAGE_SIZE: pageSize,
    })

    expect(result.success).toBe(false)
    if (!result.success) expect(result.errorMessage).toContain("sessionsSidebarPageSize")
  }
})

test("runtime configuration accepts matching internal and environment page-size values", () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)

  const result = runtimeConfigurationParse({
    ...configuration.data,
    sessionsSidebarPageSize: 40,
    SESSIONS_SIDEBAR_PAGE_SIZE: "40",
  })

  expect(result).toMatchObject({ success: true, data: { sessionsSidebarPageSize: 40 } })
})

test("runtime configuration rejects conflicting internal and environment page-size values", () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)

  const result = runtimeConfigurationParse({
    ...configuration.data,
    sessionsSidebarPageSize: 40,
    SESSIONS_SIDEBAR_PAGE_SIZE: "41",
  })

  expect(result.success).toBe(false)
  if (!result.success) expect(result.errorMessage).toContain("sessionsSidebarPageSize")
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
            if (capturedIdentity === undefined) capturedIdentity = value
            return {
              onConflictDoUpdate: () => ({ returning: async () => [{ id: "development:configured-developer" }] }),
              onConflictDoNothing: () => ({ returning: async () => [{ id: "development:configured-developer" }] }),
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
    organizationMemberLoad: async () =>
      createResult({
        issuer: "urn:codeline:development",
        organizationId: "configured-organization",
        subject: "configured-developer",
        userId: user.id,
      } as never),
  })
  const response = await app.request("http://codeline.test/api/testing/echo", {
    body: JSON.stringify({ message: "hello", ownerUserId: "client-controlled-owner" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(200)
  expect(capturedIdentity).toMatchObject({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  })
  expect(JSON.stringify(capturedIdentity)).not.toContain("client-controlled-owner")
})

test("development identity repository safely returns an error when its database operation fails", async () => {
  const result = await developmentIdentityUpsert(
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
      close: () => {
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
  const listeners = new Map<string, () => Promise<void>>()
  let stopCount = 0
  let closeCount = 0
  let removeListenerCount = 0
  const metricsCollector = metricsCollectorCreate()
  let receivedMetricsCollector: typeof metricsCollector | undefined
  const database = {
    client: {
      close: () => {
        closeCount += 1
      },
    },
    db: {},
  } as never
  const server = await serverStart({
    appCreate: (options) => {
      receivedMetricsCollector = options.metricsCollector
      return appCreate()
    },
    configuration: configuration.data,
    configurationStore: {} as never,
    database,
    metricsCollector,
    runStartupInterruptionReconcile: async () => ({ success: true as const, data: { interruptedRunIds: [] } }),
    serve: () => ({
      stop: async () => {
        stopCount += 1
      },
      url: new URL("http://codeline.test"),
    }),
    signalSource: {
      once: (signal, listener) => void listeners.set(signal, listener as () => Promise<void>),
      removeListener: (signal) => {
        removeListenerCount += 1
        listeners.delete(signal)
      },
    },
  })

  expect(server.url.toString()).toBe("http://codeline.test/")
  expect(receivedMetricsCollector).toBe(metricsCollector)
  const shutdownTerm = listeners.get("SIGTERM")
  const shutdownInterrupt = listeners.get("SIGINT")
  if (shutdownTerm === undefined || shutdownInterrupt === undefined)
    throw new Error("shutdown signal listeners were not registered")
  const firstShutdown = shutdownTerm()
  const secondShutdown = shutdownInterrupt()
  expect(secondShutdown).toBe(firstShutdown)
  await firstShutdown

  expect(stopCount).toBe(1)
  expect(closeCount).toBe(1)
  expect(removeListenerCount).toBe(2)
})

test("server shutdown drains journal pruning before closing the database", async () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)
  const listeners = new Map<string, () => Promise<void>>()
  const events: string[] = []
  let releasePrune!: () => void
  const pruneReleased = new Promise<void>((resolve) => {
    releasePrune = resolve
  })
  let pruneStarted!: () => void
  const pruneStartedPromise = new Promise<void>((resolve) => {
    pruneStarted = resolve
  })
  const journalEventsPruneScheduler = journalEventsPruneSchedulerCreate({
    cooldownMs: 0,
    database: {} as never,
    logError: () => undefined,
    prune: async () => {
      events.push("prune-start")
      pruneStarted()
      await pruneReleased
      events.push("prune-finish")
      return createResultError("runtimeConfigurationParseTest", "expected prune failure")
    },
  })
  const database = { client: { close: () => undefined }, db: {} } as never

  await serverStart({
    appCreate: () => appCreate(),
    configuration: configuration.data,
    configurationStore: {} as never,
    database,
    databaseConnectionClose: async () => {
      events.push("database-close")
      return createResult(undefined)
    },
    journalEventsPruneScheduler,
    runStartupInterruptionReconcile: async () => ({ success: true as const, data: { interruptedRunIds: [] } }),
    serve: () => ({
      stop: async () => {
        events.push("server-stop")
      },
      url: new URL("http://codeline.test"),
    }),
    signalSource: {
      once: (signal, listener) => void listeners.set(signal, listener as () => Promise<void>),
      removeListener: () => undefined,
    },
  })

  journalEventsPruneScheduler.schedule(["shutdown-user"])
  await pruneStartedPromise
  const shutdown = listeners.get("SIGTERM")
  if (shutdown === undefined) throw new Error("SIGTERM shutdown listener was not registered")
  const pendingShutdown = shutdown()

  expect(events).toEqual(["prune-start", "server-stop"])
  releasePrune()
  await pendingShutdown

  expect(events).toEqual(["prune-start", "server-stop", "prune-finish", "database-close"])
})

test("server shutdown keeps SQLite open until the HTTP server stops", async () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)
  const listeners = new Map<string, () => Promise<void>>()
  const events: string[] = []
  let releaseStop!: () => void
  const stopPromise = new Promise<void>((resolve) => {
    releaseStop = resolve
  })
  let databaseOpen = true
  const database = {
    client: {
      close: () => {
        events.push("database-close")
        databaseOpen = false
      },
    },
    db: {},
  } as never

  await serverStart({
    appCreate: () => appCreate(),
    configuration: configuration.data,
    configurationStore: {} as never,
    database,
    journalCursorCodec: {} as never,
    providerAgentCatalog: {} as never,
    projectRootDirs: [],
    runStartupInterruptionReconcile: async () => ({ success: true as const, data: { interruptedRunIds: [] } }),
    serve: () => ({
      stop: async () => {
        events.push("server-stop")
        await stopPromise
      },
      url: new URL("http://codeline.test"),
    }),
    signalSource: {
      once: (signal, listener) => void listeners.set(signal, listener as () => Promise<void>),
      removeListener: () => undefined,
    },
  })

  const shutdown = listeners.get("SIGTERM")
  if (shutdown === undefined) throw new Error("SIGTERM shutdown listener was not registered")
  const pending = shutdown()

  expect(events).toEqual(["server-stop"])
  expect(databaseOpen).toBe(true)

  releaseStop()
  await pending

  expect(events).toEqual(["server-stop", "database-close"])
  expect(databaseOpen).toBe(false)
})

test("server shutdown closes the database and removes listeners when server stop rejects", async () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)
  const listeners = new Map<string, () => Promise<void>>()
  let closeCount = 0
  let removeListenerCount = 0
  const stopError = new Error("server stop failed")
  const database = {
    client: {
      close: () => {
        closeCount += 1
      },
    },
    db: {},
  } as never

  await serverStart({
    appCreate: () => appCreate(),
    configuration: configuration.data,
    configurationStore: {} as never,
    database,
    journalCursorCodec: {} as never,
    providerAgentCatalog: {} as never,
    projectRootDirs: [],
    runStartupInterruptionReconcile: async () => ({ success: true as const, data: { interruptedRunIds: [] } }),
    serve: () => ({ stop: async () => Promise.reject(stopError), url: new URL("http://codeline.test") }),
    signalSource: {
      once: (signal, listener) => void listeners.set(signal, listener as () => Promise<void>),
      removeListener: () => {
        removeListenerCount += 1
      },
    },
  })

  const shutdown = listeners.get("SIGTERM")
  if (shutdown === undefined) throw new Error("SIGTERM shutdown listener was not registered")

  await expect(shutdown()).rejects.toBe(stopError)

  expect(closeCount).toBe(1)
  expect(removeListenerCount).toBe(2)
})

test("server shutdown removes listeners when database close rejects", async () => {
  if (!configuration.success) throw new Error(configuration.errorMessage)
  const listeners = new Map<string, () => Promise<void>>()
  let closeCount = 0
  let removeListenerCount = 0
  const closeError = new Error("database close failed")
  const database = { client: { close: () => undefined }, db: {} } as never

  await serverStart({
    appCreate: () => appCreate(),
    configuration: configuration.data,
    configurationStore: {} as never,
    database,
    databaseConnectionClose: async () => {
      closeCount += 1
      throw closeError
    },
    journalCursorCodec: {} as never,
    providerAgentCatalog: {} as never,
    projectRootDirs: [],
    runStartupInterruptionReconcile: async () => ({ success: true as const, data: { interruptedRunIds: [] } }),
    serve: () => ({ stop: async () => undefined, url: new URL("http://codeline.test") }),
    signalSource: {
      once: (signal, listener) => void listeners.set(signal, listener as () => Promise<void>),
      removeListener: () => {
        removeListenerCount += 1
      },
    },
  })

  const shutdown = listeners.get("SIGTERM")
  if (shutdown === undefined) throw new Error("SIGTERM shutdown listener was not registered")

  await expect(shutdown()).rejects.toBe(closeError)

  expect(closeCount).toBe(1)
  expect(removeListenerCount).toBe(2)
})
