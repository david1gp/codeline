import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { eventFeedCreate } from "../src/events/client/eventFeedCreate.js"
import { eventFeedOwnerRegistryCreate } from "../src/events/client/eventFeedOwnerRegistryCreate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalPostCommitPublishCreate } from "../src/journal/actions/journalPostCommitPublishCreate.js"
import { journalRunFinalize } from "../src/journal/actions/journalRunFinalize.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runProviderOutputCreate } from "../src/run/actions/runProviderOutputCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import type { SessionSettledSnapshotResponse } from "../src/session/api/sessionSettledSnapshotResponseSchema.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
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

  emit(frame: StreamSseFrame): void {
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

    const statusByRun = new Map<string, "failed" | "aborted">()
    const terminalSequenceByRun = new Map<string, number>()
    const checkpoints: string[] = []
    const publishedFrames: StreamSseFrame[] = []
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
          if ("checkpoint" in input) checkpoints.push(`${input.checkpoint}:${input.runId}`)
          return createResult({
            lastSequence:
              terminalSequenceByRun.get(input.runId) ??
              ("lastSequence" in input ? input.lastSequence : input.sessionRevision),
            partialText: `authoritative-${input.runId}`,
            runId: input.runId,
            sessionId: input.sessionId,
            status: statusByRun.get(input.runId) ?? "aborted",
          })
        },
        resourceRevalidate: async (input) =>
          createResult({
            resourceId: input.resourceId,
            resourceType: input.resourceType,
            revision: input.serverRevision,
          }),
        sessionSnapshotLoad: async () => createResult(sessionSnapshot(1)),
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

    const postCommitPublish = journalPostCommitPublishCreate({
      cursorCodec: cursorCodecResult.data,
      liveSubscription: {
        publish: (_userId, frame) => {
          const runId = (frame.data as { runId?: string }).runId
          if (frame.event !== "delta" && runId !== undefined) terminalSequenceByRun.set(runId, frame.data.sequence)
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
        statusByRun.set(actualRunId, lifecycle.terminalStatus)
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
      const expectedEvents: StreamSseFrame["event"][] =
        lifecycle.providerStatus === "interrupted" ? [] : ["delta", "delta"]
      expectedEvents.push(`run-${lifecycle.checkpoint}` as StreamSseFrame["event"])
      expect(runFrames.map((frame) => frame.event)).toEqual(expectedEvents)
      expect(runFrames.at(-1)?.data).toMatchObject({ eventType: `run-${lifecycle.checkpoint}`, runId: actualRunId })
      if (lifecycle.checkpoint === "failed")
        expect(runFrames.at(-1)?.data).toMatchObject({ failure: { code: "provider_failed" } })
      if (lifecycle.checkpoint === "cancelled")
        expect(runFrames.at(-1)?.data).toMatchObject({ reason: "user-requested" })
      if (lifecycle.checkpoint === "interrupted")
        expect(runFrames.at(-1)?.data).toMatchObject({ reason: "The API process stopped while the run was active." })
      expect(checkpoints).toContain(`${lifecycle.checkpoint}:${actualRunId}`)
      expect(feed.dataState.activeRuns.get(actualRunId)).toMatchObject({
        checkpoint: lifecycle.checkpoint,
        lastSequence: terminalSequenceByRun.get(actualRunId),
        partialText: `authoritative-${actualRunId}`,
        phase: "settled",
        terminalStatus: lifecycle.terminalStatus,
      })

      const journalEvents = await database
        .select({ eventType: journalEventTable.eventType })
        .from(journalEventTable)
        .where(eq(journalEventTable.runId, actualRunId))
      expect(journalEvents.map((event) => event.eventType)).toEqual([`run-${lifecycle.checkpoint}`])
    }

    feed.close()
  },
)
