import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../../agents/db/agentTable.js"
import { mutationIdempotencyTable } from "../../api/db/mutationIdempotencyTable.js"
import type { DatabaseExecutor } from "../../database/databaseClient.js"
import { agentInstructionsSnapshotResolve } from "../../instructions/actions/agentInstructionsSnapshotResolve.js"
import { runExecutionManifestSelectionResolve } from "../../run/actions/runExecutionManifestSelectionResolve.js"
import { runExecutionManifestSchema } from "../../run/schema/runExecutionManifestSchema.js"
import { serverTable } from "../../servers/db/serverTable.js"
import { skillSelectionSchema } from "../../skills/schema/skillSelectionSchema.js"
import { uuidv7 } from "../../uuid/uuidv7.js"
import { sessionExecutionSelectionCanonicalize } from "../actions/sessionExecutionSelectionCanonicalize.js"
import { sessionCreateMutationResponseCreate } from "../api/sessionCreateMutationResponseCreate.js"
import {
  type SessionCreateMutationResponse,
  sessionCreateMutationResponseSchema,
} from "../api/sessionCreateMutationResponseSchema.js"
import { sessionMetadataSchema } from "../schema/sessionMetadataSchema.js"
import { sessionTable } from "./sessionTable.js"

const sessionCreateOperation = "session.create"

function jsonCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(jsonCanonicalize).join(",")}]`
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${jsonCanonicalize((value as Record<string, unknown>)[key])}`)
    .join(",")}}`
}

type SessionCreateMutationResult = {
  created: boolean
  replayed: boolean
  responseBody?: SessionCreateMutationResponse
  session: typeof sessionTable.$inferSelect
}

export async function sessionRepositoryCreate(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  input: {
    clientRequestId: string
    executionSelection?: unknown
    executionManifest?: unknown
    instructionSnapshot: unknown
    id?: string
    idempotencyKey?: string
    metadata: unknown
    pinned?: boolean
    primaryAgentId: string
    projectPath?: string
    requestHash?: string
    serverId: string
    skillSelection?: unknown
    title: string
  },
): Promise<Result<SessionCreateMutationResult>> {
  const op = "sessionRepositoryCreate"
  const executionSelection = sessionExecutionSelectionCanonicalize(input.executionSelection, input.primaryAgentId)
  if (!executionSelection.success) return executionSelection
  const metadata = v.safeParse(sessionMetadataSchema, input.metadata ?? {})
  if (!metadata.success) return createResultError(op, "The session metadata is invalid.")
  const instructionSnapshot = agentInstructionsSnapshotResolve(input.instructionSnapshot)
  if (!instructionSnapshot.success) return createResultError(op, "The agent instruction snapshot is invalid.")
  const skillSelection = v.safeParse(
    skillSelectionSchema,
    input.skillSelection ?? {
      activeSkills: [],
      excludedSkillNames: [],
      missingFolderPaths: [],
      missingSkillNames: [],
      presetName: "default",
      userOverride: { disabledSkills: [], enabledSkills: [] },
      version: 1,
    },
  )
  if (!skillSelection.success) return createResultError(op, "The session skill selection is invalid.")
  let executionManifest: v.InferOutput<typeof runExecutionManifestSchema> | null = null
  if (input.executionManifest !== undefined && input.executionManifest !== null) {
    const parsedManifest = v.safeParse(runExecutionManifestSchema, input.executionManifest)
    if (!parsedManifest.success) return createResultError(op, "The session execution manifest is invalid.")
    executionManifest = parsedManifest.output
  }
  if (executionManifest !== null) {
    const expectedManifest = runExecutionManifestSelectionResolve({
      agentInstructions: instructionSnapshot.data,
      command: executionManifest.command,
      commandCatalogDigest: executionManifest.commandCatalog.digest,
      primaryAgentId: input.primaryAgentId,
      selection: executionSelection.data ?? {
        tools: {
          primary: { agentId: input.primaryAgentId, tools: {} },
          selectableSubagents: [],
        },
        version: 1,
      },
      skillSelection: skillSelection.output,
    })
    if (!expectedManifest.success)
      return createResultError(op, "The session execution manifest does not match the resolved session choices.")
    if (jsonCanonicalize(executionManifest) !== jsonCanonicalize(expectedManifest.data))
      return createResultError(op, "The session execution manifest does not match the resolved session choices.")
  }

  try {
    if (input.idempotencyKey !== undefined && input.requestHash === undefined)
      return createResultError(op, "The idempotency request hash is required.")

    if (input.idempotencyKey !== undefined) {
      const replayed = await sessionCreateIdempotencyLoad(database, userId, organizationId, input)
      if (!replayed.success) return replayed
      if (replayed.data !== undefined) return createResult(replayed.data)
    }

    const [existing] = await database
      .select({ session: sessionTable })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, input.clientRequestId)))
      .limit(1)
    if (existing !== undefined) {
      const response = sessionCreateMutationResponseCreate({ created: false, session: existing.session })
      if (!response.success) return response
      const stored = await sessionCreateIdempotencyStore(database, userId, input, existing.session.id, response.data)
      if (!stored.success) return stored
      return createResult({ created: false, replayed: false, responseBody: response.data, session: existing.session })
    }

    const [server] = await database
      .select({ id: serverTable.id })
      .from(serverTable)
      .where(and(eq(serverTable.id, input.serverId), eq(serverTable.organizationId, organizationId)))
      .limit(1)
    if (server === undefined) return createResultError(op, "The server could not be found.")

    const [agent] = await database
      .select({ id: agentTable.id })
      .from(agentTable)
      .where(and(eq(agentTable.id, input.primaryAgentId), eq(agentTable.serverId, input.serverId)))
      .limit(1)
    if (agent === undefined) return createResultError(op, "The agent could not be found.")

    const [created] = await database
      .insert(sessionTable)
      .values({
        clientRequestId: input.clientRequestId,
        executionSelection: executionSelection.data,
        executionManifest,
        instructionSnapshot: instructionSnapshot.data,
        id: input.id ?? uuidv7(),
        metadata: metadata.output,
        primaryAgentId: input.primaryAgentId,
        projectPath: input.projectPath ?? "~",
        skillSelection: skillSelection.output,
        serverId: input.serverId,
        title: input.title,
        userId,
        pinned: input.pinned ?? true,
      })
      .onConflictDoNothing({ target: [sessionTable.userId, sessionTable.clientRequestId] })
      .returning()

    if (created !== undefined) {
      const response = sessionCreateMutationResponseCreate({ created: true, session: created })
      if (!response.success) return response
      const stored = await sessionCreateIdempotencyStore(database, userId, input, created.id, response.data)
      if (!stored.success) return stored
      return createResult({ created: true, replayed: false, responseBody: response.data, session: created })
    }

    const [idempotent] = await database
      .select({ session: sessionTable })
      .from(sessionTable)
      .innerJoin(
        serverTable,
        and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
      )
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, input.clientRequestId)))
      .limit(1)
    if (idempotent === undefined) return createResultError(op, "The session could not be created.")
    const response = sessionCreateMutationResponseCreate({ created: false, session: idempotent.session })
    if (!response.success) return response
    const stored = await sessionCreateIdempotencyStore(database, userId, input, idempotent.session.id, response.data)
    if (!stored.success) return stored
    return createResult({ created: false, replayed: false, responseBody: response.data, session: idempotent.session })
  } catch (_error) {
    return createResultError(op, "The session could not be created.")
  }
}

async function sessionCreateIdempotencyLoad(
  database: DatabaseExecutor,
  userId: string,
  organizationId: string,
  input: { idempotencyKey?: string; requestHash?: string },
): Promise<Result<SessionCreateMutationResult | undefined>> {
  const op = "sessionRepositoryCreate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")

  const [idempotent] = await database
    .select()
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, sessionCreateOperation),
        eq(mutationIdempotencyTable.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (idempotent === undefined) return createResult(undefined)
  if (idempotent.requestHash !== input.requestHash) return idempotencyConflict(op)

  const response = v.safeParse(sessionCreateMutationResponseSchema, idempotent.responseBody)
  if (!response.success) return createResultError(op, "The stored idempotency response is invalid.")
  const [session] = await database
    .select({ session: sessionTable })
    .from(sessionTable)
    .innerJoin(
      serverTable,
      and(eq(sessionTable.serverId, serverTable.id), eq(serverTable.organizationId, organizationId)),
    )
    .where(and(eq(sessionTable.id, idempotent.resourceId), eq(sessionTable.userId, userId)))
    .limit(1)
  if (session === undefined) return createResultError(op, "The session could not be found.")
  return createResult({
    created: false,
    replayed: true,
    responseBody: { ...response.output, created: false },
    session: session.session,
  })
}

async function sessionCreateIdempotencyStore(
  database: DatabaseExecutor,
  userId: string,
  input: { idempotencyKey?: string; requestHash?: string },
  resourceId: string,
  response: SessionCreateMutationResponse,
): Promise<Result<void>> {
  const op = "sessionRepositoryCreate"
  if (input.idempotencyKey === undefined) return createResult(undefined)
  if (input.requestHash === undefined) return createResultError(op, "The idempotency request hash is required.")

  const inserted = await database
    .insert(mutationIdempotencyTable)
    .values({
      createdAt: new Date(),
      id: uuidv7(),
      idempotencyKey: input.idempotencyKey,
      operation: sessionCreateOperation,
      requestHash: input.requestHash,
      resourceId,
      responseBody: response,
      status: response.created ? 201 : 200,
      userId,
    })
    .onConflictDoNothing({
      target: [
        mutationIdempotencyTable.userId,
        mutationIdempotencyTable.operation,
        mutationIdempotencyTable.idempotencyKey,
      ],
    })
    .returning({ id: mutationIdempotencyTable.id })
  if (inserted.length > 0) return createResult(undefined)

  const [existing] = await database
    .select({ requestHash: mutationIdempotencyTable.requestHash })
    .from(mutationIdempotencyTable)
    .where(
      and(
        eq(mutationIdempotencyTable.userId, userId),
        eq(mutationIdempotencyTable.operation, sessionCreateOperation),
        eq(mutationIdempotencyTable.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  if (existing?.requestHash === input.requestHash) return createResult(undefined)
  return idempotencyConflict(op)
}

function idempotencyConflict(op: string) {
  const result = createResultErrorCode(
    op,
    "The idempotency key was already used for a different request.",
    "idempotency_conflict",
  )
  result.statusCode = 409
  return result
}
