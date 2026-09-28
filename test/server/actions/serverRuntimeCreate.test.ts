import { expect, spyOn, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult, createResultError } from "@adaptive-ds/result"
import { appCreate } from "../../../src/app/appCreate.js"
import { journalCursorCodecCreate } from "../../../src/journal/actions/journalCursorCodecCreate.js"
import { serverRuntimeCreate } from "../../../src/server/serverRuntimeCreate.js"
import type { ServerRuntimeOptions } from "../../../src/server/serverRuntimeOptions.js"
import { serverShutdownCoordinatorCreate } from "../../../src/server/serverShutdownCoordinatorCreate.js"

function serverRuntimeFixtureCreate(options: ServerRuntimeOptions = {}): ServerRuntimeOptions {
  const cursorCodec = journalCursorCodecCreate({ randomBytes, secret: "runtime-test-secret" })
  if (!cursorCodec.success) throw new Error(cursorCodec.errorMessage)
  return {
    configuration: { authMode: "oidc", databaseUrl: "file:./data/db.sqlite", nodeEnv: "test" },
    configurationStore: {} as never,
    database: { client: { close: () => undefined }, db: {} } as never,
    journalCursorCodec: cursorCodec.data,
    projectRootDirs: [],
    providerAgentCatalog: { agents: [], providers: [], revision: `sha256-${"0".repeat(64)}` },
    runStartupInterruptionReconcile: async () => createResult({ interruptedRunIds: [] }),
    ...options,
  }
}

function deferredCreate() {
  let resolve!: () => void
  const promise = new Promise<void>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

test("runtime exposes the composed application after reconciliation without listening, logging or owning signals", async () => {
  const serve = spyOn(Bun, "serve").mockImplementation(() => {
    throw new Error("The runtime must not open a listener.")
  })
  const once = spyOn(process, "once").mockImplementation(() => process)
  const removeListener = spyOn(process, "removeListener")
  const log = spyOn(console, "log").mockImplementation(() => undefined)
  const events: string[] = []
  let receivedDependencies: Parameters<typeof appCreate>[0]
  const options = serverRuntimeFixtureCreate({
    appCreate: (dependencies) => {
      events.push("application")
      receivedDependencies = dependencies
      return appCreate(dependencies)
    },
    runStartupInterruptionReconcile: async (dependencies) => {
      events.push("reconciliation")
      expect(dependencies.database === receivedDependencies?.database).toBe(true)
      expect(dependencies.runActiveRegistry).toBe(receivedDependencies?.runActiveRegistry)
      expect(receivedDependencies?.journalPostCommitPublish).toBe(dependencies.postCommitPublish)
      await Promise.resolve()
      return createResult({ interruptedRunIds: [] })
    },
  })

  try {
    const result = await serverRuntimeCreate(options)
    expect(result.success).toBe(true)
    if (!result.success) return
    try {
      expect(events).toEqual(["application", "reconciliation"])
      expect(receivedDependencies).toBe(result.data.dependencies)
      expect(options.configuration).toBe(result.data.dependencies.configuration)
      expect(options.configurationStore).toBe(result.data.dependencies.configurationStore)
      expect(options.database?.db).toBe(result.data.dependencies.database)
      expect(options.projectRootDirs).toBe(result.data.dependencies.projectRootDirs)
      expect(options.providerAgentCatalog).toBe(result.data.dependencies.providerAgentCatalog)
      expect(result.data.dependencies.globalSummaryLiveSubscription).toBe(
        result.data.dependencies.streamLiveSubscription,
      )

      const health = await result.data.application.fetch(new Request("http://codeline.test/health"))
      expect(health.status).toBe(200)
      expect(await health.json()).toEqual({ service: "codeline", status: "ok" })
      for (const path of ["/api/project/list", "/api/session/list"]) {
        const unauthorized = await result.data.application.fetch(new Request(`http://codeline.test${path}`))
        expect(unauthorized.status).toBe(401)
        expect(await unauthorized.json()).toMatchObject({ error: { code: "unauthorized" } })
      }
    } finally {
      expect(await result.data.shutdown()).toEqual(createResult(undefined))
    }
    expect(serve).not.toHaveBeenCalled()
    expect(once).not.toHaveBeenCalled()
    expect(removeListener).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  } finally {
    serve.mockRestore()
    once.mockRestore()
    removeListener.mockRestore()
    log.mockRestore()
  }
})

test("no-listener shutdown aborts work and closes admission before draining and closing the database exactly once", async () => {
  const drain = deferredCreate()
  const events: string[] = []
  const result = await serverRuntimeCreate(
    serverRuntimeFixtureCreate({
      database: { client: { close: () => events.push("database-close") }, db: {} } as never,
      journalEventsPruneScheduler: {
        drain: async () => {
          events.push("drain-start")
          await drain.promise
          events.push("drain-finish")
        },
        flush: async () => undefined,
        schedule: () => undefined,
        trackedUserCount: () => 0,
      },
    }),
  )
  expect(result.success).toBe(true)
  if (!result.success) return
  const controller = new AbortController()
  result.data.dependencies.shutdownCoordinator.register(controller)
  const first = result.data.shutdown()
  try {
    expect(result.data.shutdown()).toBe(first)
    expect(controller.signal.aborted).toBe(true)
    expect(result.data.dependencies.shutdownCoordinator.admit()).toBe(false)
    expect((await result.data.application.fetch(new Request("http://codeline.test/health"))).status).toBe(503)
    expect(events).toEqual(["drain-start"])
  } finally {
    drain.resolve()
    expect(await first).toEqual(createResult(undefined))
  }
  expect(result.data.shutdown()).toBe(first)
  expect(events).toEqual(["drain-start", "drain-finish", "database-close"])
})

test("runtime cleanup attempts database close after drain failure and retains all cleanup errors", async () => {
  const drainError = new Error("drain failed")
  let closes = 0
  const result = await serverRuntimeCreate(
    serverRuntimeFixtureCreate({
      databaseConnectionClose: async () => {
        closes += 1
        return createResultError("databaseConnectionClose", "close failed")
      },
      journalEventsPruneScheduler: {
        drain: async () => {
          throw drainError
        },
        flush: async () => undefined,
        schedule: () => undefined,
        trackedUserCount: () => 0,
      },
    }),
  )
  expect(result.success).toBe(true)
  if (!result.success) return
  const pending = result.data.shutdown()
  const closed = await pending
  expect(closed.success).toBe(false)
  if (closed.success) return
  expect(closed.op).toBe("serverRuntimeShutdown")
  expect(closed.diagnostics.deadlineExceeded).toBe(false)
  expect(closed.diagnostics.errors).toHaveLength(1)
  const error = closed.diagnostics.errors[0]?.error
  expect(error).toBeInstanceOf(AggregateError)
  expect((error as AggregateError).errors).toEqual([drainError, new Error("close failed")])
  expect(result.data.shutdown()).toBe(pending)
  expect(closes).toBe(1)
})

test("no-listener shutdown retains the coordinated deadline and finishes pending cleanup after it", async () => {
  const drain = deferredCreate()
  let deadline!: () => void
  let closes = 0
  const coordinator = serverShutdownCoordinatorCreate({
    setTimeout: (handler, timeoutMs) => {
      expect(timeoutMs).toBe(25_000)
      deadline = handler
      return 1
    },
    clearTimeout: () => undefined,
  })
  const result = await serverRuntimeCreate(
    serverRuntimeFixtureCreate({
      databaseConnectionClose: async () => {
        closes += 1
        return createResult(undefined)
      },
      journalEventsPruneScheduler: {
        drain: () => drain.promise,
        flush: async () => undefined,
        schedule: () => undefined,
        trackedUserCount: () => 0,
      },
      serverShutdownCoordinator: coordinator,
    }),
  )
  expect(result.success).toBe(true)
  if (!result.success) return
  const pending = result.data.shutdown()
  try {
    deadline()
    const closed = await pending
    expect(closed.success).toBe(false)
    if (closed.success) return
    expect(closed.diagnostics.deadlineExceeded).toBe(true)
    expect(closed.diagnostics.errors).toEqual([expect.objectContaining({ phase: "deadline" })])
    expect(closes).toBe(0)
    expect(result.data.shutdown()).toBe(pending)
  } finally {
    drain.resolve()
    await drain.promise
    await Promise.resolve()
  }
  expect(closes).toBe(1)
})

test("failed startup reconciliation returns its error only after runtime resources are cleaned up", async () => {
  const events: string[] = []
  const failure = createResultError("runStartupInterruptionReconcile", "reconciliation failed")
  const coordinator = serverShutdownCoordinatorCreate()
  const result = await serverRuntimeCreate(
    serverRuntimeFixtureCreate({
      databaseConnectionClose: async () => {
        events.push("database-close")
        return createResult(undefined)
      },
      journalEventsPruneScheduler: {
        drain: async () => void events.push("drain"),
        flush: async () => undefined,
        schedule: () => undefined,
        trackedUserCount: () => 0,
      },
      runStartupInterruptionReconcile: async () => failure,
      serverShutdownCoordinator: coordinator,
    }),
  )
  expect(result).toBe(failure)
  expect(events).toEqual(["drain", "database-close"])
  expect(coordinator.admit()).toBe(false)
  expect(coordinator.signal.aborted).toBe(true)
})
