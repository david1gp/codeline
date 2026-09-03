import { expect, test } from "bun:test"
import * as v from "valibot"
import { apiErrorResponseSchema } from "../src/api/errors/apiErrorResponseSchema.js"
import { apiIdempotencyResultSchemaCreate } from "../src/api/schema/apiIdempotencyResultSchemaCreate.js"
import { runActiveSnapshotResponseSchema } from "../src/run/api/runActiveSnapshotResponseSchema.js"
import { sessionBoundedSnapshotSchema } from "../src/session/api/sessionBoundedSnapshotSchema.js"

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

test("active-run snapshots accept terminal statuses intentionally", () => {
  const response = { lastSequence: 4, partialText: "partial" }
  for (const status of ["succeeded", "failed", "aborted"] as const) {
    expect(v.safeParse(runActiveSnapshotResponseSchema, { ...response, status }).success).toBe(true)
  }
  expect(v.safeParse(runActiveSnapshotResponseSchema, { ...response, input: null, status: "running" }).success).toBe(
    false,
  )
})

test("bounded session reconciliation uses the bounded typed payload", () => {
  const response = {
    detailCursor: "cursor-4",
    hasMore: false,
    latestAnswer: null,
    olderCursor: null,
    semanticSteps: [{ id: "entry-1", kind: "message", role: "assistant", sequence: 1, summary: "Answer" }],
    session: {
      id: "session-1",
      pinned: false,
      projectPath: "/tmp/project",
      revision: 4,
      title: "Session",
    },
    state: { input: null, run: null },
    throughPosition: 1,
  }
  expect(v.safeParse(sessionBoundedSnapshotSchema, response).success).toBe(true)
  expect(
    v.safeParse(sessionBoundedSnapshotSchema, {
      ...response,
      hasMore: true,
    }).success,
  ).toBe(false)
  expect(v.safeParse(sessionBoundedSnapshotSchema, { ...response, detailCursor: undefined }).success).toBe(false)
  expect(v.safeParse(sessionBoundedSnapshotSchema, { throughPosition: -1 }).success).toBe(false)
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
