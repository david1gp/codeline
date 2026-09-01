import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { asc, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { eventFeedCreate } from "../src/events/client/eventFeedCreate.js"
import { eventFeedOwnerRegistryCreate } from "../src/events/client/eventFeedOwnerRegistryCreate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalGlobalSummaryPostCommitPublishCreate } from "../src/journal/actions/journalGlobalSummaryPostCommitPublishCreate.js"
import { journalPostCommitPublishCreate } from "../src/journal/actions/journalPostCommitPublishCreate.js"
import { journalRunFinalize } from "../src/journal/actions/journalRunFinalize.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runProviderOutputCreate } from "../src/run/actions/runProviderOutputCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import type { SessionSettledSnapshotResponse } from "../src/session/api/sessionSettledSnapshotResponseSchema.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import type { GlobalSummarySseFrame } from "../src/stream/api/globalSummarySseFrameSchema.js"
import type { StreamSseFrame } from "../src/stream/api/streamSseFrameSchema.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

type FakeEventListener = (event: Event) => void

class FakeEventSource {
  readonly listeners = new Map<string, Set<FakeEventListener>>()
  readonly url: string
  readonly withCredentials: boolean
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null
  readyState = 0

  constructor(url: string, options: { withCredentials: boolean }) {
    this.url = url
    this.withCredentials = options.withCredentials
  }

  addEventListener(type: string, listener: FakeEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<FakeEventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  close(): void {
    this.readyState = 2
  }

  emit(frame: StreamSseFrame | GlobalSummarySseFrame): void {
    const message = new Event(frame.event) as Event & { data?: unknown; lastEventId?: unknown }
    message.data = JSON.stringify(frame.data)
    message.lastEventId = frame.id
    for (const listener of [...(this.listeners.get(frame.event) ?? [])]) listener(message)
  }

  open(): void {
    this.readyState = 1
    this.onopen?.(new Event("open"))
  }

  removeEventListener(type: string, listener: FakeEventListener): void {
    const listeners = this.listeners.get(type)
    listeners?.delete(listener)
    if (listeners?.size === 0) this.listeners.delete(type)
  }
}

class TestScheduler {
  private nextTimerId = 1

  clearTimeout(_handle: unknown): void {}

  setTimeout(_handler: () => void, _timeoutMs: number): number {
    return this.nextTimerId++
  }
}

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `run-feed-agent-${uuidv7()}`,
  organizationId: `run-feed-organization-${uuidv7()}`,
  serverId: `run-feed-server-${uuidv7()}`,
  sessionId: `run-feed-session-${uuidv7()}`,
  userId: `run-feed-user-${uuidv7()}`,
}

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(applicationUserTable).values({ displayName: fixture.userId, id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: fixture.organizationId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://run-feed-server.test",
    id: fixture.serverId,
    name: fixture.serverId,
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: fixture.agentId,
    role: "coding",
    serverId: fixture.serverId,
  })
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: fixture.sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Run feed lifecycle session",
    userId: fixture.userId,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
  }
  await databaseConnectionClose(connection)
})

function sessionSnapshot(revision: number): SessionSettledSnapshotResponse {
  const timestamp = "2026-01-01T00:00:00.000Z"
  return {
    asOfCursor: "unused",
    asOfSequence: revision,
    etag: `"run-feed-${revision}"`,
    messages: [],
    revision,
    schemaVersion: "session-snapshot-v1",
    session: {
      archivedAt: null,
      createdAt: timestamp,
      id: fixture.sessionId,
      metadata: null,
      parentSessionId: null,
      pinned: false,
      primaryAgentId: fixture.agentId,
      projectPath: "~",
      revision,
      serverId: fixture.serverId,
      title: "Run feed lifecycle session",
      updatedAt: timestamp,
    },
    settled: true,
  }
}

function runInput(clientRunId: string, streamId: string) {
  return {
    budget: { maxDurationMs: 10_000 },
    clientRunId,
    snapshot: {
      configuration: { model: "deterministic-model", provider: "deterministic" as const },
      configurationRevision: "configuration-revision-1",
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId,
  }
}

test.skipIf(!databaseAvailable)(
  "publishes run-started only after an accepted run is admitted for execution",
  async () => {
    const runId = `run-feed-start-${uuidv7()}`
    const created = await runCreate(database, fixture.userId, fixture.sessionId, runInput(runId, `stream-${runId}`))
    expect(created).toMatchObject({ success: true, data: { created: true, run: { status: "accepted" } } })
    if (!created.success) return

    const cursorCodecResult = journalCursorCodecCreate({ randomBytes, secret: `run-feed-start-secret-${uuidv7()}` })
    expect(cursorCodecResult.success).toBe(true)
    if (!cursorCodecResult.success) return
    const frames: StreamSseFrame[] = []
    const provider = runProviderOutputCreate({
      database,
      journalPostCommitPublish: journalPostCommitPublishCreate({
        cursorCodec: cursorCodecResult.data,
        liveSubscription: { publish: (_userId, frame) => frames.push(frame) },
      }),
      requestId: `request-${created.data.run.id}`,
      runId: created.data.run.id,
      scheduler: new TestScheduler(),
      sessionId: fixture.sessionId,
      userId: fixture.userId,
    })

    const started = await provider.start()
    expect(started).toMatchObject({ success: true, data: { changed: true, run: { status: "running" } } })
    const [run] = await database
      .select({ status: runTable.status })
      .from(runTable)
      .where(eq(runTable.id, created.data.run.id))
    const events = await database
      .select({ eventType: journalEventTable.eventType, payload: journalEventTable.payload })
      .from(journalEventTable)
      .where(eq(journalEventTable.runId, created.data.run.id))
    expect(run?.status).toBe("running")
    expect(events).toMatchObject([
      { eventType: "run-started", payload: { runId: created.data.run.id, sessionId: fixture.sessionId } },
    ])
    expect(frames.map((frame) => frame.event)).toEqual(["run-started"])

    expect(await provider.finalize({ reason: "test-complete", status: "aborted" })).toMatchObject({ success: true })
  },
)

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

test.skipIf(!databaseAvailable)(
  "publishes failed, cancelled, and interrupted journal checkpoints through feed reconciliation",
  async () => {
    const cursorCodecResult = journalCursorCodecCreate({ randomBytes, secret: `run-feed-secret-${uuidv7()}` })
    expect(cursorCodecResult.success).toBe(true)
    if (!cursorCodecResult.success) return
    const initialCursorResult = cursorCodecResult.data.encodeDeterministic(fixture.userId, 0)
    expect(initialCursorResult.success).toBe(true)
    if (!initialCursorResult.success) return

    const terminalSequenceByRun = new Map<string, number>()
    const reconciledTerminalKinds: string[] = []
    const publishedFrames: GlobalSummarySseFrame[] = []
    let source: FakeEventSource | undefined
    const feed = eventFeedCreate({
      bootstrap: { asOfCursor: initialCursorResult.data, lastEventId: initialCursorResult.data },
      eventSourceFactory: (url, options) => {
        source = new FakeEventSource(url, options)
        return source
      },
      ownershipRegistry: eventFeedOwnerRegistryCreate(),
      onEvent: (frame) => publishedFrames.push(frame),
      reconciliation: {
        activeRunSnapshotLoad: async (input) => {
          return createResult({
            lastSequence: terminalSequenceByRun.get(input.runId) ?? input.lastSequence,
            partialText: `authoritative-${input.runId}`,
            runId: input.runId,
            sessionId: input.sessionId,
            status: "running",
          })
        },
        resourceRevalidate: async (input) =>
          createResult({
            resourceId: input.resourceId,
            resourceType: input.resourceType,
            revision: input.serverRevision,
          }),
        sessionSnapshotLoad: async (input) => {
          if ("terminalKind" in input) reconciledTerminalKinds.push(`${input.terminalKind}:${input.runId}`)
          return createResult(sessionSnapshot(input.sessionRevision ?? 1))
        },
        sessionSnapshotReplace: async () => createResult(undefined),
        shellListBootstrap: async (input) =>
          createResult({
            activeRuns: [],
            asOfCursor: input.resetCheckpoint,
            resetCheckpoint: input.resetCheckpoint,
            resourceRevisions: [],
          }),
        visibleResources: () => [],
      },
    })
    if (source === undefined) throw new Error("The feed source was not created.")
    source.open()

    const postCommitPublish = journalGlobalSummaryPostCommitPublishCreate({
      cursorCodec: cursorCodecResult.data,
      liveSubscription: {
        globalSummaryPublish: (_userId, frame) => {
          const runId = (frame.data as { runId?: string }).runId
          if (runId !== undefined) terminalSequenceByRun.set(runId, frame.data.globalSequence)
          source?.emit(frame)
        },
      },
    })

    const lifecycleCases = [
      { checkpoint: "failed" as const, providerStatus: "failed" as const, terminalStatus: "failed" as const },
      { checkpoint: "cancelled" as const, providerStatus: "aborted" as const, terminalStatus: "aborted" as const },
      {
        checkpoint: "interrupted" as const,
        providerStatus: "interrupted" as const,
        terminalStatus: "aborted" as const,
      },
    ]

    for (const lifecycle of lifecycleCases) {
      const runId = `run-feed-${lifecycle.checkpoint}-${uuidv7()}`
      let actualRunId = runId

      const framesBeforeRun = publishedFrames.length
      if (lifecycle.providerStatus === "failed" || lifecycle.providerStatus === "aborted") {
        const created = await runCreate(database, fixture.userId, fixture.sessionId, runInput(runId, `stream-${runId}`))
        expect(created.success).toBe(true)
        if (!created.success) return
        actualRunId = created.data.run.id
        expect(
          await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, { status: "running" }),
        ).toMatchObject({ success: true })
        const provider = runProviderOutputCreate({
          database,
          journalPostCommitPublish: postCommitPublish,
          requestId: `request-${actualRunId}`,
          runId: created.data.run.id,
          scheduler: new TestScheduler(),
          sessionId: fixture.sessionId,
          userId: fixture.userId,
        })
        expect(await provider.append({ delta: "first", type: "TEXT_MESSAGE_CONTENT" })).toMatchObject({ success: true })
        expect(await provider.append({ delta: "second", type: "TEXT_MESSAGE_CONTENT" })).toMatchObject({
          success: true,
        })
        expect(provider.pendingCount()).toBe(1)
        const finalized = await provider.finalize(
          lifecycle.providerStatus === "failed"
            ? { failure: { code: "provider_failed", message: "The provider failed." }, status: "failed" }
            : { reason: "user-requested", status: "aborted" },
        )
        expect(finalized).toMatchObject({ success: true })
        expect(provider.pendingCount()).toBe(0)
      } else {
        const finalizer = journalRunFinalize({
          database,
          postCommitPublish,
          resolveRecipients: async () => createResult([fixture.userId]),
        })
        const interrupted = await finalizer.finalize(
          {
            runId: actualRunId,
            terminalEvent: {
              eventType: "run-interrupted",
              payload: {
                changePosition: 1,
                reason: "The API process stopped while the run was active.",
                runId: actualRunId,
                sessionId: fixture.sessionId,
                sessionRevision: 1,
              },
            },
          },
          async () => createResult(undefined),
        )
        expect(interrupted).toMatchObject({ success: true })
      }

      await flush()
      const runFrames = publishedFrames.slice(framesBeforeRun)
      const expectedEvents: GlobalSummarySseFrame["event"][] = []
      expectedEvents.push(`run-${lifecycle.checkpoint}` as GlobalSummarySseFrame["event"])
      expect(runFrames.map((frame) => frame.event)).toEqual(expectedEvents)
      expect(runFrames.at(-1)?.data).toMatchObject({ eventType: `run-${lifecycle.checkpoint}`, runId: actualRunId })
      if (lifecycle.checkpoint === "failed")
        expect(runFrames.at(-1)?.data).toMatchObject({ failure: { code: "provider_failed" } })
      if (lifecycle.checkpoint === "cancelled")
        expect(runFrames.at(-1)?.data).toMatchObject({ reason: "user-requested" })
      if (lifecycle.checkpoint === "interrupted")
        expect(runFrames.at(-1)?.data).toMatchObject({ reason: "The API process stopped while the run was active." })
      expect(reconciledTerminalKinds).toContain(`${lifecycle.checkpoint}:${actualRunId}`)
      expect(feed.dataState.activeRuns.has(actualRunId)).toBe(false)

      const journalEvents = await database
        .select({ eventType: journalEventTable.eventType })
        .from(journalEventTable)
        .where(eq(journalEventTable.runId, actualRunId))
      expect(journalEvents.map((event) => event.eventType)).toEqual([`run-${lifecycle.checkpoint}`])
    }

    feed.close()
  },
)

test.skipIf(!databaseAvailable)(
  "keeps successful run completion durable when a live feed observer throws",
  async () => {
    const runId = `run-feed-observer-${uuidv7()}`
    const created = await runCreate(database, fixture.userId, fixture.sessionId, runInput(runId, `stream-${runId}`))
    expect(created).toMatchObject({ success: true, data: { created: true } })
    if (!created.success) return
    expect(
      await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, { status: "running" }),
    ).toMatchObject({ success: true })

    const cursorCodecResult = journalCursorCodecCreate({ randomBytes, secret: `run-feed-observer-secret-${uuidv7()}` })
    expect(cursorCodecResult.success).toBe(true)
    if (!cursorCodecResult.success) return
    const initialCursorResult = cursorCodecResult.data.encodeDeterministic(fixture.userId, 0)
    expect(initialCursorResult.success).toBe(true)
    if (!initialCursorResult.success) return

    let source: FakeEventSource | undefined
    let sessionSnapshotLoads = 0
    const feed = eventFeedCreate({
      bootstrap: { asOfCursor: initialCursorResult.data, lastEventId: initialCursorResult.data },
      eventSourceFactory: (url, options) => {
        source = new FakeEventSource(url, options)
        return source
      },
      ownershipRegistry: eventFeedOwnerRegistryCreate(),
      reconciliation: {
        activeRunSnapshotLoad: async (input) =>
          createResult({
            lastSequence: input.lastSequence,
            partialText: "",
            runId: input.runId,
            sessionId: input.sessionId,
            status: "succeeded",
          }),
        resourceRevalidate: async (input) =>
          createResult({
            resourceId: input.resourceId,
            resourceType: input.resourceType,
            revision: input.serverRevision,
          }),
        sessionSnapshotLoad: async (input) => {
          sessionSnapshotLoads += 1
          return createResult(sessionSnapshot(input.sessionRevision ?? 1))
        },
        sessionSnapshotReplace: async () => createResult(undefined),
        shellListBootstrap: async (input) =>
          createResult({
            activeRuns: [],
            asOfCursor: input.resetCheckpoint,
            resetCheckpoint: input.resetCheckpoint,
            resourceRevisions: [],
          }),
        visibleResources: () => [],
      },
    })
    if (source === undefined) throw new Error("The feed source was not created.")
    source.open()

    const liveSubscription = streamLiveSubscriptionCreate()
    let brokenObserverCalls = 0
    const unsubscribeBrokenObserver = liveSubscription.globalSummarySubscribe(fixture.userId, () => {
      brokenObserverCalls += 1
      throw new Error("The live observer failed.")
    })
    const healthyFrames: GlobalSummarySseFrame[] = []
    const unsubscribeHealthyObserver = liveSubscription.globalSummarySubscribe(fixture.userId, (event) => {
      healthyFrames.push(event)
      source?.emit(event)
    })
    const provider = runProviderOutputCreate({
      database,
      journalPostCommitPublish: journalGlobalSummaryPostCommitPublishCreate({
        cursorCodec: cursorCodecResult.data,
        liveSubscription,
      }),
      requestId: `request-${created.data.run.id}`,
      runId: created.data.run.id,
      scheduler: new TestScheduler(),
      sessionId: fixture.sessionId,
      userId: fixture.userId,
    })

    expect(await provider.finalize({ assistantText: "Committed completion.", status: "succeeded" })).toMatchObject({
      success: true,
    })
    const [run] = await database.select().from(runTable).where(eq(runTable.id, created.data.run.id)).limit(1)
    const [attempt] = await database
      .select()
      .from(attemptTable)
      .where(eq(attemptTable.runId, created.data.run.id))
      .limit(1)
    const journalEvents = await database
      .select({ eventType: journalEventTable.eventType })
      .from(journalEventTable)
      .where(eq(journalEventTable.runId, created.data.run.id))

    await flush()
    expect(brokenObserverCalls).toBe(1)
    expect(healthyFrames.map((frame) => frame.event)).toEqual(["run-completed"])
    expect(run).toMatchObject({ status: "succeeded" })
    expect(attempt).toMatchObject({ status: "succeeded" })
    expect(journalEvents.map((event) => event.eventType)).toEqual(["run-completed"])
    expect(sessionSnapshotLoads).toBe(1)
    expect(feed.dataState.activeRuns.has(created.data.run.id)).toBe(false)
    expect(feed.dataState.resourceRevisions.get(`session:${fixture.sessionId}`)).toBe(2)

    unsubscribeHealthyObserver()
    unsubscribeBrokenObserver()
    feed.close()
    expect(liveSubscription.globalSummarySubscriberCount(fixture.userId)).toBe(0)
  },
)

test.skipIf(!databaseAvailable)(
  "keeps success, failure, and cancellation durable when one live observer disconnects",
  async () => {
    const lifecycleCases = [
      {
        eventType: "run-completed" as const,
        input: { assistantText: "Committed completion.", status: "succeeded" as const },
        runStatus: "succeeded" as const,
      },
      {
        eventType: "run-failed" as const,
        input: { failure: { code: "provider_failed", message: "The provider failed." }, status: "failed" as const },
        runStatus: "failed" as const,
      },
      {
        eventType: "run-cancelled" as const,
        input: { reason: "user-requested", status: "aborted" as const },
        runStatus: "aborted" as const,
      },
    ]

    for (const lifecycle of lifecycleCases) {
      const runId = `run-feed-publication-${lifecycle.runStatus}-${uuidv7()}`
      const created = await runCreate(database, fixture.userId, fixture.sessionId, runInput(runId, `stream-${runId}`))
      expect(created).toMatchObject({ success: true, data: { created: true } })
      if (!created.success) return
      expect(
        await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, { status: "running" }),
      ).toMatchObject({ success: true })

      const cursorCodecResult = journalCursorCodecCreate({
        randomBytes,
        secret: `run-feed-publication-secret-${uuidv7()}`,
      })
      expect(cursorCodecResult.success).toBe(true)
      if (!cursorCodecResult.success) return

      const liveSubscription = streamLiveSubscriptionCreate()
      let brokenObserverCalls = 0
      let unsubscribeBrokenObserver: () => void = () => undefined
      unsubscribeBrokenObserver = liveSubscription.subscribe(fixture.userId, () => {
        brokenObserverCalls += 1
        unsubscribeBrokenObserver()
        throw new Error("The live observer disconnected.")
      })
      const healthyFrames: StreamSseFrame[] = []
      const unsubscribeHealthyObserver = liveSubscription.subscribe(fixture.userId, (event) => {
        if ("data" in event) healthyFrames.push(event as StreamSseFrame)
      })
      const provider = runProviderOutputCreate({
        database,
        journalPostCommitPublish: journalPostCommitPublishCreate({
          cursorCodec: cursorCodecResult.data,
          liveSubscription,
        }),
        requestId: `request-${created.data.run.id}`,
        runId: created.data.run.id,
        scheduler: new TestScheduler(),
        sessionId: fixture.sessionId,
        userId: fixture.userId,
      })

      const finalized = await provider.finalize(lifecycle.input)
      expect(finalized).toMatchObject({ success: true })
      const duplicateFinalization = await provider.finalize(lifecycle.input)
      expect(duplicateFinalization).toMatchObject({
        code: "journal_run_already_finalized",
        success: false,
      })

      const [run] = await database.select().from(runTable).where(eq(runTable.id, created.data.run.id)).limit(1)
      const [attempt] = await database
        .select()
        .from(attemptTable)
        .where(eq(attemptTable.runId, created.data.run.id))
        .limit(1)
      const journalEvents = await database
        .select({
          eventType: journalEventTable.eventType,
          payload: journalEventTable.payload,
          sequence: journalEventTable.sequence,
        })
        .from(journalEventTable)
        .where(eq(journalEventTable.runId, created.data.run.id))
        .orderBy(asc(journalEventTable.sequence))

      expect(brokenObserverCalls).toBe(1)
      expect(healthyFrames.map((frame) => frame.event)).toEqual([lifecycle.eventType])
      expect(liveSubscription.subscriberCount(fixture.userId)).toBe(1)
      expect(run).toMatchObject({ status: lifecycle.runStatus })
      expect(attempt).toMatchObject({ status: lifecycle.runStatus })
      expect(journalEvents).toHaveLength(1)
      expect(journalEvents.map((event) => event.eventType)).toEqual([lifecycle.eventType])

      if (lifecycle.runStatus === "failed") {
        expect(run).toMatchObject({ failure: lifecycle.input.failure })
        expect(attempt).toMatchObject({ failure: lifecycle.input.failure })
        expect(journalEvents[0]?.payload).toMatchObject({ failure: lifecycle.input.failure })
      }
      if (lifecycle.runStatus === "aborted") {
        expect(journalEvents[0]?.payload).toMatchObject({ reason: lifecycle.input.reason })
      }

      const terminalEvent = journalEvents[0]
      expect(terminalEvent).toBeDefined()
      if (terminalEvent === undefined) return
      const recoveryCursor = cursorCodecResult.data.encodeDeterministic(fixture.userId, terminalEvent.sequence - 1)
      expect(recoveryCursor.success).toBe(true)
      if (!recoveryCursor.success) return
      const backlog = await journalBacklogRead(
        { cursorCodec: cursorCodecResult.data, database },
        { lastEventId: recoveryCursor.data, userId: fixture.userId },
      )
      expect(backlog.success).toBe(true)
      if (!backlog.success) return
      const recoveredFrames: StreamSseFrame[] = []
      for await (const page of backlog.data.pages) {
        expect(page.success).toBe(true)
        if (page.success) recoveredFrames.push(...page.data)
      }
      expect(recoveredFrames).toHaveLength(1)
      expect(recoveredFrames[0]).toMatchObject({
        data: { eventType: lifecycle.eventType, runId: created.data.run.id, sequence: terminalEvent.sequence },
        event: lifecycle.eventType,
      })

      unsubscribeHealthyObserver()
      unsubscribeBrokenObserver()
      expect(liveSubscription.subscriberCount(fixture.userId)).toBe(0)
    }
  },
)

test.skipIf(!databaseAvailable)("durably records bash tool start, result, and terminal lifecycle events", async () => {
  const runId = `run-feed-bash-${uuidv7()}`
  const created = await runCreate(database, fixture.userId, fixture.sessionId, runInput(runId, `stream-${runId}`))
  expect(created).toMatchObject({ success: true, data: { created: true } })
  if (!created.success) return
  expect(
    await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, { status: "running" }),
  ).toMatchObject({ success: true })
  const cursorCodec = await journalCursorCodecCreate({ randomBytes, secret: `run-feed-bash-secret-${uuidv7()}` })
  expect(cursorCodec.success).toBe(true)
  if (!cursorCodec.success) return

  const provider = runProviderOutputCreate({
    database,
    journalPostCommitPublish: journalPostCommitPublishCreate({
      cursorCodec: cursorCodec.data,
      liveSubscription: { publish: () => undefined },
    }),
    requestId: `request-${created.data.run.id}`,
    runId: created.data.run.id,
    scheduler: new TestScheduler(),
    sessionId: fixture.sessionId,
    userId: fixture.userId,
  })
  expect(
    await provider.append({
      toolCallId: "call-bash-durable",
      toolCallName: "bash",
      toolName: "bash",
      type: "TOOL_CALL_START",
    }),
  ).toMatchObject({ success: true })
  expect(
    await provider.append({
      content: JSON.stringify({
        exitCode: 0,
        stderr: "",
        stdout: "durable output",
        truncated: false,
        workingDirectory: "/tmp/project",
      }),
      state: "output-available",
      toolCallId: "call-bash-durable",
      type: "TOOL_CALL_RESULT",
    }),
  ).toMatchObject({ success: true })
  const lifecycleDeltas = await database
    .select({ eventType: journalEventTable.eventType, payload: journalEventTable.payload })
    .from(journalEventTable)
    .where(eq(journalEventTable.runId, created.data.run.id))
    .orderBy(asc(journalEventTable.sequence))
  expect(lifecycleDeltas.map((event) => event.eventType)).toEqual(["delta", "delta"])
  expect(JSON.stringify(lifecycleDeltas[0]?.payload)).toContain("call-bash-durable")
  expect(JSON.stringify(lifecycleDeltas[1]?.payload)).toContain("durable output")

  expect(await provider.finalize({ assistantText: "Finished bash.", status: "succeeded" })).toMatchObject({
    success: true,
  })

  const journalEvents = await database
    .select({ eventType: journalEventTable.eventType, payload: journalEventTable.payload })
    .from(journalEventTable)
    .where(eq(journalEventTable.runId, created.data.run.id))
    .orderBy(asc(journalEventTable.sequence))
  expect(journalEvents.map((event) => event.eventType)).toEqual(["run-completed"])
})

test.skipIf(!databaseAvailable)("replays webfetch tool lifecycle deltas with stable durable payloads", async () => {
  const runId = `run-feed-webfetch-${uuidv7()}`
  const created = await runCreate(database, fixture.userId, fixture.sessionId, runInput(runId, `stream-${runId}`))
  expect(created).toMatchObject({ success: true, data: { created: true } })
  if (!created.success) return
  expect(
    await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, { status: "running" }),
  ).toMatchObject({ success: true })
  const cursorCodec = await journalCursorCodecCreate({ randomBytes, secret: `run-feed-webfetch-secret-${uuidv7()}` })
  expect(cursorCodec.success).toBe(true)
  if (!cursorCodec.success) return

  const provider = runProviderOutputCreate({
    database,
    journalPostCommitPublish: journalPostCommitPublishCreate({
      cursorCodec: cursorCodec.data,
      liveSubscription: { publish: () => undefined },
    }),
    requestId: `request-${created.data.run.id}`,
    runId: created.data.run.id,
    scheduler: new TestScheduler(),
    sessionId: fixture.sessionId,
    userId: fixture.userId,
  })
  expect(
    await provider.append({
      toolCallId: "call-webfetch-durable",
      toolCallName: "webfetch",
      toolName: "webfetch",
      type: "TOOL_CALL_START",
    }),
  ).toMatchObject({ success: true })
  expect(
    await provider.append({
      content: JSON.stringify({
        contentType: "text/plain",
        format: "text",
        output: "replayable content",
        truncated: false,
        url: "https://example.test/durable",
      }),
      state: "output-available",
      toolCallId: "call-webfetch-durable",
      type: "TOOL_CALL_RESULT",
    }),
  ).toMatchObject({ success: true })

  const readDeltas = async () =>
    database
      .select({ eventType: journalEventTable.eventType, payload: journalEventTable.payload })
      .from(journalEventTable)
      .where(eq(journalEventTable.runId, created.data.run.id))
      .orderBy(asc(journalEventTable.sequence))
  const firstReplay = await readDeltas()
  const secondReplay = await readDeltas()
  expect(secondReplay).toEqual(firstReplay)
  expect(firstReplay.map((event) => event.eventType)).toEqual(["delta", "delta"])
  expect(firstReplay[0]?.payload).toMatchObject({
    deltaKind: "tool",
    messageId: expect.stringMatching(/^tool-[0-9a-f]{24}-start$/),
  })
  expect(firstReplay[1]?.payload).toMatchObject({
    deltaKind: "tool",
    messageId: expect.stringMatching(/^tool-[0-9a-f]{24}-result$/),
  })
  expect(JSON.stringify(firstReplay)).toContain("replayable content")
  expect(JSON.stringify(firstReplay)).not.toContain("timestamp")

  expect(await provider.finalize({ status: "succeeded" })).toMatchObject({ success: true })
})
