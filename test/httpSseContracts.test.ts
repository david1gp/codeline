import { expect, test } from "bun:test"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { apiIdempotencyResultSchemaCreate } from "../src/api/schema/apiIdempotencyResultSchemaCreate.js"
import { runActiveSnapshotResponseSchema } from "../src/run/api/runActiveSnapshotResponseSchema.js"
import { runActiveSummarySchema } from "../src/run/api/runActiveSummarySchema.js"
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
