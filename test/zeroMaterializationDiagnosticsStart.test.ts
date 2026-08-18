import { afterEach, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import * as solidRuntime from "solid-js/dist/solid.js"

type InspectorQuery = Record<string, any>

mock.module("solid-js", () => solidRuntime)
const { zeroMaterializationDiagnosticsStart } = await import("../src/ui/zeroMaterializationDiagnosticsStart.js")

type Timer = { callback: () => void; delay: number }

const originalSetTimeout = globalThis.setTimeout
const originalClearTimeout = globalThis.clearTimeout
const originalWarn = console.warn
const environment = Bun.env as Record<string, string | undefined>

let timers: Timer[] = []
let warnings: unknown[] = []

afterEach(() => {
  globalThis.setTimeout = originalSetTimeout
  globalThis.clearTimeout = originalClearTimeout
  console.warn = originalWarn
  delete environment.DEV
  timers = []
  warnings = []
})

function timerInstall() {
  timers = []
  globalThis.setTimeout = ((callback: () => void, delay: number) => {
    const timer = { callback, delay }
    timers.push(timer)
    return timer as unknown as ReturnType<typeof setTimeout>
  }) as typeof setTimeout
  globalThis.clearTimeout = ((timer: ReturnType<typeof setTimeout>) => {
    timers = timers.filter((candidate) => candidate !== (timer as unknown as Timer))
  }) as typeof clearTimeout
}

function queryCreate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    args: ["page"],
    clientZQL: "session.orderBy(updatedAt,desc)",
    deleted: false,
    hydrateClient: 2_000,
    hydrateServer: 3_500,
    hydrateTotal: 6_000,
    id: "query-1",
    inactivatedAt: new Date("2026-08-18T12:00:00.000Z"),
    name: "activeSessions",
    rowCount: 3,
    serverZQL: "session.limit(2)",
    ttl: "5m",
    analyze: async () => ({
      dbScansByQuery: [{ query: "activeSessions", scans: 1 }],
      joinPlans: [
        {
          type: "node-cost",
          filters: {
            type: "simple",
            left: { type: "column", name: "userId" },
            op: "=",
            right: { type: "literal", value: "secret-user" },
          },
          constraint: { userId: "secret-user" },
        },
      ],
      readRowCount: 4,
      readRowCountsByQuery: { activeSessions: 4 },
      sqlitePlans: { activeSessions: ["SEARCH sessions USING INDEX sessions_user_id"] },
    }),
    ...overrides,
  } as unknown as InspectorQuery
}

function zeroCreate(queries: readonly InspectorQuery[]) {
  return { inspector: { client: { queries: async () => queries } } } as never
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

test("development diagnostics report slow queries once with safe analysis fields", async () => {
  environment.DEV = "true"
  timerInstall()
  console.warn = ((diagnostic: unknown) => warnings.push(diagnostic)) as typeof console.warn
  const analyzeCalls: unknown[] = []
  const query = queryCreate({
    analyze: async (options: unknown) => {
      analyzeCalls.push(options)
      return {
        dbScansByQuery: [{ query: "activeSessions", scans: 1 }],
        joinPlans: [
          {
            type: "node-cost",
            filters: {
              type: "simple",
              left: { type: "column", name: "userId" },
              op: "=",
              right: { type: "literal", value: "secret-user" },
            },
            constraint: { userId: "secret-user" },
          },
        ],
        readRowCount: 4,
        readRowCountsByQuery: { activeSessions: 4 },
        sqlitePlans: { activeSessions: ["SEARCH sessions USING INDEX sessions_user_id"] },
      }
    },
  })
  const root = createRoot((rootDispose) => {
    zeroMaterializationDiagnosticsStart(zeroCreate([query]))
    return rootDispose
  })

  expect(timers.map((timer) => timer.delay)).toEqual([0])
  timers[0]?.callback()
  await flush()
  expect(warnings).toHaveLength(1)
  expect(timers.map((timer) => timer.delay)).toEqual([0, 1_000])

  const diagnostic = warnings[0] as Record<string, unknown>
  expect(diagnostic).toMatchObject({
    hydrateClient: 2_000,
    hydrateServer: 3_500,
    hydrateTotal: 6_000,
    rowCount: 3,
    thresholdMs: 5_000,
    type: "zero-slow-query-materialization",
  })
  expect(diagnostic.query).toEqual({
    args: "[redacted]",
    clientZQL: "[redacted]",
    id: "query-1",
    inactivatedAt: query.inactivatedAt,
    name: "activeSessions",
    serverZQL: "[redacted]",
    ttl: "5m",
  })
  expect(diagnostic.analysis).toMatchObject({ status: "available" })
  expect(analyzeCalls).toEqual([{ joinPlans: true, syncedRows: false, vendedRows: false }])
  expect((diagnostic.analysis as { result: unknown }).result).toMatchObject({
    dbScansByQuery: [{ query: "activeSessions", scans: 1 }],
    readRowCount: 4,
    readRowCountsByQuery: { activeSessions: 4 },
    sqlitePlans: { activeSessions: ["SEARCH sessions USING INDEX sessions_user_id"] },
  })
  expect((diagnostic.analysis as { result: Record<string, unknown> }).result).not.toHaveProperty("joinPlans")
  expect(JSON.stringify(diagnostic)).not.toContain("secret-user")

  timers.at(-1)?.callback()
  await flush()
  expect(warnings).toHaveLength(1)
  root()
})

test("development diagnostics ignore the threshold, deleted, and unfinished queries", async () => {
  environment.DEV = "true"
  timerInstall()
  console.warn = ((diagnostic: unknown) => warnings.push(diagnostic)) as typeof console.warn
  const queries = [
    queryCreate({ id: "exact", hydrateTotal: 5_000 }),
    queryCreate({ id: "deleted", deleted: true }),
    queryCreate({ id: "unfinished", hydrateTotal: null }),
  ]
  const root = createRoot((rootDispose) => {
    zeroMaterializationDiagnosticsStart(zeroCreate(queries))
    return rootDispose
  })
  timers[0]?.callback()
  await flush()

  expect(warnings).toHaveLength(0)
  root()
})

test("development diagnostics deduplicate an unchanged query and report changed hydration totals", async () => {
  environment.DEV = "true"
  timerInstall()
  console.warn = ((diagnostic: unknown) => warnings.push(diagnostic)) as typeof console.warn
  const query = queryCreate()
  const root = createRoot((rootDispose) => {
    zeroMaterializationDiagnosticsStart(zeroCreate([query]))
    return rootDispose
  })

  timers[0]?.callback()
  await flush()
  timers.at(-1)?.callback()
  await flush()
  expect(warnings).toHaveLength(1)
  query.hydrateTotal = 7_000
  timers.at(-1)?.callback()
  await flush()
  expect(warnings).toHaveLength(2)
  root()
})

test("development diagnostics treat analysis and inspector failures as best effort", async () => {
  environment.DEV = "true"
  timerInstall()
  console.warn = ((diagnostic: unknown) => warnings.push(diagnostic)) as typeof console.warn
  const query = queryCreate({ analyze: async () => Promise.reject(new Error("analysis unavailable")) })
  const root = createRoot((rootDispose) => {
    zeroMaterializationDiagnosticsStart(zeroCreate([query]))
    return rootDispose
  })
  timers[0]?.callback()
  await flush()
  expect((warnings[0] as { analysis: unknown }).analysis).toEqual({ status: "unavailable" })
  root()

  timerInstall()
  const unavailableZero = {
    inspector: { client: { queries: async () => Promise.reject(new Error("offline")) } },
  } as never
  const unavailableRoot = createRoot((rootDispose) => {
    zeroMaterializationDiagnosticsStart(unavailableZero)
    return rootDispose
  })
  timers[0]?.callback()
  await flush()
  expect(timers).toHaveLength(1)
  unavailableRoot()
})

test("development diagnostics skip analysis when no server or named query data exists", async () => {
  environment.DEV = "true"
  timerInstall()
  console.warn = ((diagnostic: unknown) => warnings.push(diagnostic)) as typeof console.warn
  let analyzeCalls = 0
  const query = queryCreate({
    analyze: async () => {
      analyzeCalls += 1
      return {} as never
    },
    args: null,
    name: null,
    serverZQL: null,
  })
  const root = createRoot((rootDispose) => {
    zeroMaterializationDiagnosticsStart(zeroCreate([query]))
    return rootDispose
  })
  timers[0]?.callback()
  await flush()

  expect(analyzeCalls).toBe(0)
  expect((warnings[0] as { analysis: unknown }).analysis).toEqual({ status: "unavailable" })
  root()
})

test("production diagnostics do not schedule polling", () => {
  timerInstall()
  const root = createRoot((rootDispose) => {
    zeroMaterializationDiagnosticsStart(zeroCreate([]))
    return rootDispose
  })

  expect(timers).toHaveLength(0)
  root()
})
