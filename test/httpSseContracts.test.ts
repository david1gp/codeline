import { expect, test } from "bun:test"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { apiIdempotencyResultSchemaCreate } from "../src/api/schema/apiIdempotencyResultSchemaCreate.js"
import { runActiveSnapshotResponseSchema } from "../src/run/api/runActiveSnapshotResponseSchema.js"
import { runActiveSummarySchema } from "../src/run/api/runActiveSummarySchema.js"
import { sessionSnapshotResponseSchema } from "../src/session/api/sessionSnapshotResponseSchema.js"
import { streamSseFrameSchema } from "../src/stream/api/streamSseFrameSchema.js"
import { streamSseFrameSerialize } from "../src/stream/api/streamSseFrameSerialize.js"

const sseMaximumBytes = 128 * 1024
const deltaEvent = {
  delta: "",
  deltaKind: "text" as const,
  eventType: "delta" as const,
  id: "journal-1",
  messageId: null,
  runId: "run-1",
  sequence: 1,
  sessionId: "session-1",
}

test("the shared API error contract accepts structured precondition failures", () => {
  expect(
    v.safeParse(apiErrorResponseSchema, {
      error: {
        code: "precondition_failed",
        currentEtag: '"session-revision-2"',
        currentRevision: 2,
        message: "The session changed.",
        op: "sessionRename",
        retryable: false,
        status: 412,
      },
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(apiErrorResponseSchema, {
      error: {
        code: "precondition_failed",
        message: "The session changed.",
        op: "sessionRename",
        retryable: false,
        status: 409,
      },
    }).success,
  ).toBe(false)
})

test("standard API error extensions are deliberately validated", () => {
  expect(
    v.safeParse(apiErrorResponseSchema, {
      error: {
        code: "not_found",
        details: { resource: "session" },
        message: "The session was not found.",
        op: "sessionLoad",
        requestId: "request-1",
        retryable: false,
        status: 404,
      },
    }).success,
  ).toBe(true)
  expect(
    v.safeParse(apiErrorResponseSchema, {
      error: {
        code: "not_found",
        extra: "not-supported",
        message: "The session was not found.",
      },
    }).success,
  ).toBe(false)
})

test("active-run reconciliation accepts terminal statuses intentionally", () => {
  for (const status of ["succeeded", "failed", "aborted"] as const) {
    expect(
      v.safeParse(runActiveSummarySchema, {
        lastSequence: 4,
        partialText: "partial",
        runId: "run-1",
        sessionId: "session-1",
        status,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(runActiveSnapshotResponseSchema, { lastSequence: 4, partialText: "partial", status }).success,
    ).toBe(true)
  }
})

test("settled session reconciliation uses the complete authoritative typed payload", () => {
  const response = {
    asOfSequence: 4,
    etag: '"session-4"',
    messages: [],
    revision: 4,
    schemaVersion: "session-snapshot-v1",
    session: {
      archivedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      id: "session-1",
      metadata: null,
      parentSessionId: null,
      pinned: false,
      primaryAgentId: "agent-1",
      projectPath: "/tmp/project",
      revision: 4,
      serverId: "server-1",
      title: "Session",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    settled: true,
  }
  expect(v.safeParse(sessionSnapshotResponseSchema, response).success).toBe(true)
  expect(
    v.safeParse(sessionSnapshotResponseSchema, {
      ...response,
      session: { ...response.session, id: "session-2" },
    }).success,
  ).toBe(true)
  expect(v.safeParse(sessionSnapshotResponseSchema, { revision: 4 }).success).toBe(false)
})

test("SSE size validation covers the complete serialized frame", () => {
  const emptyDataBytes = new TextEncoder().encode(JSON.stringify(deltaEvent)).byteLength
  const frameOverheadBytes =
    new TextEncoder().encode(streamSseFrameSerialize({ data: deltaEvent, event: "delta", id: deltaEvent.id }))
      .byteLength - emptyDataBytes
  const withinLimit = {
    ...deltaEvent,
    delta: "x".repeat(sseMaximumBytes - emptyDataBytes - frameOverheadBytes),
  }
  const overLimit = {
    ...deltaEvent,
    delta: "x".repeat(sseMaximumBytes - emptyDataBytes - frameOverheadBytes + 1),
  }

  expect(
    new TextEncoder().encode(streamSseFrameSerialize({ data: withinLimit, event: "delta", id: withinLimit.id }))
      .byteLength,
  ).toBe(sseMaximumBytes)
  expect(v.safeParse(streamSseFrameSchema, { data: withinLimit, event: "delta", id: withinLimit.id }).success).toBe(
    true,
  )
  expect(
    new TextEncoder().encode(streamSseFrameSerialize({ data: overLimit, event: "delta", id: overLimit.id })).byteLength,
  ).toBe(sseMaximumBytes + 1)
  expect(v.safeParse(streamSseFrameSchema, { data: overLimit, event: "delta", id: overLimit.id }).success).toBe(false)
  expect(v.safeParse(streamSseFrameSchema, { data: deltaEvent, event: "run-failed", id: deltaEvent.id }).success).toBe(
    false,
  )
})

test("idempotency results validate response bodies with an operation schema", () => {
  const responseSchema = v.strictObject({ created: v.boolean(), messageId: v.string() })
  const resultSchema = apiIdempotencyResultSchemaCreate(responseSchema)

  const parsed = v.safeParse(resultSchema, {
    idempotencyKey: "  prompt-1 ",
    replayed: true,
    responseBody: { created: false, messageId: "message-1" },
    status: 200,
  })
  expect(parsed.success).toBe(true)
  if (parsed.success) expect(parsed.output.idempotencyKey).toBe("prompt-1")
  expect(
    v.safeParse(resultSchema, {
      idempotencyKey: "prompt-1",
      replayed: false,
      responseBody: { created: true },
      status: 201,
    }).success,
  ).toBe(false)
})
