import { expect, test } from "bun:test"
import { messageAppend } from "../src/message/convex/messageAppend.js"
import { messageLoadDurableHistory } from "../src/message/convex/messageLoadDurableHistory.js"
import { runCancel } from "../src/run/convex/runCancel.js"
import { runChildCreate } from "../src/run/convex/runChildCreate.js"
import { runCreate } from "../src/run/convex/runCreate.js"
import { runDelegationFinalize } from "../src/run/convex/runDelegationFinalize.js"
import { runLoad } from "../src/run/convex/runLoad.js"
import { runRetryAttemptCreate } from "../src/run/convex/runRetryAttemptCreate.js"
import { runTransition } from "../src/run/convex/runTransition.js"
import { streamReplay } from "../src/stream/convex/streamReplay.js"
import { streamReplayAppend } from "../src/stream/convex/streamReplayAppend.js"
import { streamAppend } from "../src/stream/convex/streamAppend.js"

type StoredDocument = { _id: string; [key: string]: unknown }
type Predicate = { field: string; operation: "eq" | "gt" | "gte" | "lt" | "lte"; value: unknown }
type Rows = Map<string, StoredDocument[]>
type MemoryIndexQuery = {
  eq: (field: string, value: unknown) => MemoryIndexQuery
  gt: (field: string, value: unknown) => MemoryIndexQuery
  gte: (field: string, value: unknown) => MemoryIndexQuery
  lt: (field: string, value: unknown) => MemoryIndexQuery
  lte: (field: string, value: unknown) => MemoryIndexQuery
}

class MemoryQuery {
  private readonly direction: "asc" | "desc"
  private readonly indexName: string
  private readonly predicates: readonly Predicate[]
  private readonly rows: Rows
  private readonly table: string

  constructor(
    rows: Rows,
    table: string,
    indexName = "",
    predicates: readonly Predicate[] = [],
    direction: "asc" | "desc" = "asc",
  ) {
    this.direction = direction
    this.indexName = indexName
    this.predicates = predicates
    this.rows = rows
    this.table = table
  }

  withIndex(name: string, apply: (query: MemoryIndexQuery) => unknown) {
    const predicates: Predicate[] = [...this.predicates]
    const query: MemoryIndexQuery = {
      eq: (field: string, value: unknown) => {
        predicates.push({ field, operation: "eq", value })
        return query
      },
      gt: (field: string, value: unknown) => {
        predicates.push({ field, operation: "gt", value })
        return query
      },
      gte: (field: string, value: unknown) => {
        predicates.push({ field, operation: "gte", value })
        return query
      },
      lt: (field: string, value: unknown) => {
        predicates.push({ field, operation: "lt", value })
        return query
      },
      lte: (field: string, value: unknown) => {
        predicates.push({ field, operation: "lte", value })
        return query
      },
    }
    apply(query)
    return new MemoryQuery(this.rows, this.table, name, predicates, this.direction)
  }

  order(direction: "asc" | "desc") {
    return new MemoryQuery(this.rows, this.table, this.indexName, this.predicates, direction)
  }

  async collect(): Promise<StoredDocument[]> {
    const filtered = (this.rows.get(this.table) ?? []).filter((row) =>
      this.predicates.every((predicate) => {
        const left = row[predicate.field] as string | number | undefined
        const right = predicate.value as string | number | undefined
        if (predicate.operation === "eq") return left === right
        if (predicate.operation === "gt") return left !== undefined && right !== undefined && left > right
        if (predicate.operation === "gte") return left !== undefined && right !== undefined && left >= right
        if (predicate.operation === "lt") return left !== undefined && right !== undefined && left < right
        return left !== undefined && right !== undefined && left <= right
      }),
    )
    const sortField = this.indexName.includes("Ordinal")
      ? "ordinal"
      : this.indexName.includes("Sequence")
        ? "sequence"
        : this.indexName.includes("UpdatedAt")
          ? "updatedAt"
          : "id"
    return filtered.sort((left, right) => {
      const leftValue = left[sortField] ?? ""
      const rightValue = right[sortField] ?? ""
      if (leftValue === rightValue) return String(left.id).localeCompare(String(right.id))
      const result = leftValue < rightValue ? -1 : 1
      return this.direction === "asc" ? result : -result
    })
  }

  async first(): Promise<StoredDocument | null> {
    return (await this.collect())[0] ?? null
  }

  async take(limit: number): Promise<StoredDocument[]> {
    return (await this.collect()).slice(0, limit)
  }
}

function memoryContext() {
  const rows: Rows = new Map()
  let nextId = 1
  const db = {
    insert: async (table: string, value: Record<string, unknown>) => {
      const document = { ...value, _id: `${table}:${nextId}` }
      nextId += 1
      rows.set(table, [...(rows.get(table) ?? []), document])
      return document._id
    },
    patch: async (table: string, id: string, value: Record<string, unknown>) => {
      const tableRows = rows.get(table) ?? []
      const index = tableRows.findIndex((row) => row._id === id)
      if (index < 0) throw new Error("document not found")
      const current = tableRows[index]
      if (current === undefined) throw new Error("document not found")
      const next = { ...current }
      for (const [key, entry] of Object.entries(value)) {
        if (entry === undefined) delete next[key]
        else next[key] = entry
      }
      tableRows[index] = next
    },
    query: (table: string) => new MemoryQuery(rows, table),
  }
  return { context: { db } as any, db, rows }
}

function sessionDocument(id = "session-1", overrides: Record<string, unknown> = {}) {
  return {
    archivedAt: undefined,
    id,
    primaryAgentId: "agent-1",
    serverId: "server-1",
    updatedAt: 1,
    userId: "user-1",
    ...overrides,
  }
}

function runInput(clientRunId: string, streamId: string) {
  return {
    budget: { maxAttempts: 2, maxChildDepth: 1, maxChildRuns: 2, maxDurationMs: 10_000 },
    clientRunId,
    snapshot: {
      configuration: { model: "test-model", provider: "deterministic" },
      configurationRevision: "revision-1",
      target: { agentId: "agent-1", serverId: "server-1" },
    },
    streamId,
  }
}

test("Convex messages preserve ordering and client-request idempotency", async () => {
  const { context, db } = memoryContext()
  await db.insert("sessions", sessionDocument())

  const first = await messageAppend(
    context,
    "user-1",
    "session-1",
    {
      clientRequestId: "message-1",
      content: "hello",
      role: "user",
    },
    10,
  )
  expect(first).toMatchObject({ success: true, data: { created: true, message: { sequence: 1 } } })
  const repeated = await messageAppend(
    context,
    "user-1",
    "session-1",
    {
      clientRequestId: "message-1",
      content: "hello",
      role: "user",
    },
    20,
  )
  expect(repeated).toMatchObject({ success: true, data: { created: false, message: { sequence: 1 } } })
  const conflict = await messageAppend(
    context,
    "user-1",
    "session-1",
    {
      clientRequestId: "message-1",
      content: "changed",
      role: "user",
    },
    30,
  )
  expect(conflict.success).toBe(false)
  expect(
    await messageAppend(context, "user-2", "session-1", {
      clientRequestId: "foreign-message",
      content: "not allowed",
      role: "user",
    }),
  ).toMatchObject({ success: false })

  const second = await messageAppend(
    context,
    "user-1",
    "session-1",
    {
      clientRequestId: "message-2",
      content: "world",
      role: "assistant",
    },
    40,
  )
  expect(second).toMatchObject({ success: true, data: { created: true, message: { sequence: 2 } } })
  expect(await messageLoadDurableHistory(context, "user-1", "session-1")).toMatchObject({
    success: true,
    data: [{ sequence: 1 }, { sequence: 2 }],
  })
})

test("Convex runs preserve idempotency, transitions, retry, delegation, and cancellation", async () => {
  const { context, db, rows } = memoryContext()
  await db.insert("sessions", sessionDocument())

  const created = await runCreate(context, "user-1", "session-1", runInput("run-1", "stream-1"), 1_000)
  expect(created).toMatchObject({
    success: true,
    data: { created: true, attempt: { ordinal: 1 }, run: { status: "accepted" } },
  })
  if (!created.success) return
  const repeated = await runCreate(context, "user-1", "session-1", runInput("run-1", "stream-1"), 2_000)
  expect(repeated).toMatchObject({ success: true, data: { created: false, attempt: { id: created.data.attempt.id } } })
  const streamConflict = await runCreate(context, "user-1", "session-1", runInput("run-1b", "stream-1"), 2_000)
  expect(streamConflict).toMatchObject({ success: false, errorMessage: expect.stringContaining("stream ID") })

  const running = await runTransition(context, "user-1", "session-1", created.data.run.id, { status: "running" }, 2_000)
  expect(running).toMatchObject({
    success: true,
    data: { changed: true, run: { status: "running" }, attempt: { status: "running" } },
  })
  if (!running.success) return
  expect(
    await runTransition(context, "user-1", "session-1", created.data.run.id, { status: "running" }, 2_050),
  ).toMatchObject({
    success: true,
    data: { changed: false, run: { status: "running" }, attempt: { status: "running" } },
  })

  const child = await runChildCreate(
    context,
    "user-1",
    "session-1",
    {
      delegationKey: "child-1",
      parentAttemptId: running.data.attempt.id,
      parentRunId: created.data.run.id,
      task: "child task",
    },
    2_100,
  )
  expect(child).toMatchObject({
    success: true,
    data: { created: true, delegation: { parentRunId: created.data.run.id } },
  })
  if (!child.success) return
  const childRunning = await runTransition(
    context,
    "user-1",
    "session-1",
    child.data.run.id,
    { status: "running" },
    2_200,
  )
  expect(childRunning.success).toBe(true)
  const finalized = await runDelegationFinalize(
    context,
    "user-1",
    "session-1",
    child.data.delegation.id,
    {
      status: "succeeded",
      text: "done",
    },
    2_300,
  )
  expect(finalized).toMatchObject({
    success: true,
    data: { changed: true, run: { status: "succeeded" }, attempt: { status: "succeeded" } },
  })
  const finalizedAgain = await runDelegationFinalize(
    context,
    "user-1",
    "session-1",
    child.data.delegation.id,
    {
      status: "succeeded",
      text: "done",
    },
    2_400,
  )
  expect(finalizedAgain).toMatchObject({ success: true, data: { changed: false } })

  const pendingChild = await runChildCreate(
    context,
    "user-1",
    "session-1",
    {
      delegationKey: "child-2",
      parentAttemptId: running.data.attempt.id,
      parentRunId: created.data.run.id,
      task: "pending child task",
    },
    2_500,
  )
  expect(pendingChild.success).toBe(true)

  const retryRun = await runCreate(context, "user-1", "session-1", runInput("run-2", "stream-2"), 3_000)
  expect(retryRun.success).toBe(true)
  if (!retryRun.success) return
  const retryRunning = await runTransition(
    context,
    "user-1",
    "session-1",
    retryRun.data.run.id,
    { status: "running" },
    3_100,
  )
  if (!retryRunning.success) return
  const failure = { code: "provider_failed", message: "temporary" }
  const failed = await runTransition(
    context,
    "user-1",
    "session-1",
    retryRun.data.run.id,
    { failure, status: "failed" },
    3_200,
  )
  expect(failed).toMatchObject({ success: true, data: { run: { status: "failed" }, attempt: { status: "failed" } } })
  const retry = await runRetryAttemptCreate(context, "user-1", "session-1", retryRun.data.run.id, { now: 3_300 })
  expect(retry).toMatchObject({
    success: true,
    data: { created: true, attempt: { ordinal: 2 }, run: { status: "accepted" } },
  })
  const retryAgain = await runRetryAttemptCreate(context, "user-1", "session-1", retryRun.data.run.id, { now: 3_400 })
  expect(retryAgain).toMatchObject({ success: true, data: { created: false, attempt: { ordinal: 2 } } })

  const cancelled = await runCancel(context, "user-1", "session-1", created.data.run.id, { kind: "requested" }, 3_500)
  expect(cancelled).toMatchObject({ success: true, data: { changed: true, descendantsCancelled: 1 } })

  const loaded = await runLoad(context, "user-1", "session-1", "run-2")
  expect(loaded).toMatchObject({
    success: true,
    data: {
      attempts: [
        { ordinal: 1, status: "failed" },
        { ordinal: 2, status: "accepted" },
      ],
    },
  })
  expect(await runLoad(context, "user-2", "session-1", "run-2")).toMatchObject({ success: false })
  expect((rows.get("runs") ?? []).some((run) => run.streamId === "stream-1")).toBe(true)
})

test("Convex stream replay atomically advances checkpoints and deduplicates events", async () => {
  const { context, db } = memoryContext()
  await db.insert("sessions", sessionDocument())

  const first = await streamReplayAppend(
    context,
    "user-1",
    "session-1",
    {
      eventType: "delta",
      idempotencyKey: "event-1",
      payload: { text: "one" },
      sequence: 1,
      streamId: "stream-1",
    },
    60_000,
    10_000,
  )
  expect(first).toMatchObject({
    success: true,
    data: { created: true, checkpoint: { lastSequence: 1 }, event: { sequence: 1 } },
  })
  const repeated = await streamReplayAppend(
    context,
    "user-1",
    "session-1",
    {
      eventType: "delta",
      idempotencyKey: "event-1",
      payload: { text: "one" },
      sequence: 1,
      streamId: "stream-1",
    },
    60_000,
    11_000,
  )
  expect(repeated).toMatchObject({ success: true, data: { created: false, checkpoint: { lastSequence: 1 } } })
  const gap = await streamReplayAppend(
    context,
    "user-1",
    "session-1",
    {
      eventType: "delta",
      idempotencyKey: "event-3",
      payload: { text: "three" },
      sequence: 3,
      streamId: "stream-1",
    },
    60_000,
    12_000,
  )
  expect(gap.success).toBe(false)

  const replay = await streamReplay(
    context,
    "user-1",
    "session-1",
    "stream-1",
    {
      afterSequence: 0,
      inactivityTimeoutMs: 60_000,
      limit: 100,
    },
    13_000,
  )
  expect(replay).toMatchObject({
    success: true,
    data: { checkpoint: { lastSequence: 1 }, events: [{ sequence: 1 }], stale: false },
  })
  const invalidTimeout = await streamReplay(
    context,
    "user-1",
    "session-1",
    "stream-1",
    {
      inactivityTimeoutMs: 0,
    },
    13_000,
  )
  expect(invalidTimeout.success).toBe(false)
  expect(
    await streamReplay(context, "user-2", "session-1", "stream-1", { inactivityTimeoutMs: 60_000 }, 13_000),
  ).toMatchObject({ success: false })
})

test("Convex replay repairs only the next contiguous checkpoint after a transient event write", async () => {
  const { context, db } = memoryContext()
  await db.insert("sessions", sessionDocument())
  expect(
    await streamReplay(context, "user-1", "session-1", "stream-1", { inactivityTimeoutMs: 60_000 }, 10_000),
  ).toMatchObject({
    success: true,
    data: { checkpoint: { lastSequence: 0 } },
  })

  const outOfOrder = await streamAppend(
    context,
    "user-1",
    "session-1",
    {
      eventType: "delta",
      idempotencyKey: "event-2",
      payload: { text: "two" },
      sequence: 2,
      streamId: "stream-1",
    },
    11_000,
  )
  expect(outOfOrder).toMatchObject({ success: true, data: { created: true } })
  const gapReplay = await streamReplayAppend(
    context,
    "user-1",
    "session-1",
    {
      eventType: "delta",
      idempotencyKey: "event-2",
      payload: { text: "two" },
      sequence: 2,
      streamId: "stream-1",
    },
    60_000,
    12_000,
  )
  expect(gapReplay).toMatchObject({ success: true, data: { created: false, checkpoint: { lastSequence: 0 } } })

  const first = await streamAppend(
    context,
    "user-1",
    "session-1",
    {
      eventType: "delta",
      idempotencyKey: "event-1",
      payload: { text: "one" },
      sequence: 1,
      streamId: "stream-1",
    },
    13_000,
  )
  expect(first).toMatchObject({ success: true, data: { created: true } })
  const firstReplay = await streamReplayAppend(
    context,
    "user-1",
    "session-1",
    {
      eventType: "delta",
      idempotencyKey: "event-1",
      payload: { text: "one" },
      sequence: 1,
      streamId: "stream-1",
    },
    60_000,
    14_000,
  )
  expect(firstReplay).toMatchObject({ success: true, data: { created: false, checkpoint: { lastSequence: 1 } } })

  const secondReplay = await streamReplayAppend(
    context,
    "user-1",
    "session-1",
    {
      eventType: "delta",
      idempotencyKey: "event-2",
      payload: { text: "two" },
      sequence: 2,
      streamId: "stream-1",
    },
    60_000,
    15_000,
  )
  expect(secondReplay).toMatchObject({ success: true, data: { created: false, checkpoint: { lastSequence: 2 } } })
})
