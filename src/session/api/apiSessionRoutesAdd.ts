import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { StreamChunk } from "@tanstack/ai"
import type { Context } from "hono"
import { Hono } from "hono"
import * as v from "valibot"
import { agentConfigurationExecutionResolve } from "../../agents/actions/agentConfigurationExecutionResolve.js"
import type { AgentConfiguration } from "../../agents/schema/agentConfigurationSchema.js"
import { apiRequestParse } from "../../api/apiRequestParse.js"
import type { AppEnvironment } from "../../api/appEnvironment.js"
import { apiIfMatchEtagParse } from "../../api/conditional/apiIfMatchEtagParse.js"
import { apiIfNoneMatchMatches } from "../../api/conditional/apiIfNoneMatchMatches.js"
import type { ApiErrorResponse } from "../../api/errors/apiErrorResponseSchema.js"
import { apiIdempotencyRequestHashCreate } from "../../api/idempotency/apiIdempotencyRequestHashCreate.js"
import { apiRepresentationHeadersCreate } from "../../api/representation/apiRepresentationHeadersCreate.js"
import { apiCompleteSnapshotResponseCreate } from "../../api/response/apiCompleteSnapshotResponseCreate.js"
import { apiIdempotencyKeySchema } from "../../api/schema/apiIdempotencyKeySchema.js"
import type { ConfigurationStore } from "../../configuration/configurationStore.js"
import type { ExecutionConvexClient } from "../../convex/executionConvexClient.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import { providerAgentCatalogExecutionResolve } from "../../providers/catalog/providerAgentCatalogExecutionResolve.js"
import type { CliProxyApiAdapter } from "../../providers/runtime/cliProxyApiAdapterCreate.js"
import { providerDelegationAdapterCreate } from "../../providers/runtime/providerDelegationAdapterCreate.js"
import { providerDelegationToolLoopCreate } from "../../providers/runtime/providerDelegationToolLoopCreate.js"
import { providerDeterministicScenarioResolve } from "../../providers/runtime/providerDeterministicScenarioResolve.js"
import { providerExecutionEventFromStreamChunk } from "../../providers/runtime/providerExecutionEventFromStreamChunk.js"
import type { ProviderModelDiscoveryOptions } from "../../providers/runtime/providerModelDiscovery.js"
import { providerRuntimeAdapterCreate } from "../../providers/runtime/providerRuntimeAdapterCreate.js"
import { providerRuntimeAdapterResolve } from "../../providers/runtime/providerRuntimeAdapterResolve.js"
import type { ProviderCatalog } from "../../providers/schema/providerCatalogSchema.js"
import { runCancellationCoordinatorCreate } from "../../run/actions/runCancellationCoordinatorCreate.js"
import { runDelegationExecute } from "../../run/actions/runDelegationExecute.js"
import { runExecutionSnapshotResolve } from "../../run/actions/runExecutionSnapshotResolve.js"
import { runFailureClassResolve } from "../../run/actions/runFailureClassResolve.js"
import type { attemptTable } from "../../run/db/attemptTable.js"
import type { runTable } from "../../run/db/runTable.js"
import type { RunExecutionSnapshot } from "../../run/schema/runExecutionSnapshotSchema.js"
import { runExecutionSnapshotSchema } from "../../run/schema/runExecutionSnapshotSchema.js"
import { executionStreamEventNormalize } from "../../stream/actions/executionStreamEventNormalize.js"
import { streamReplayErrorRetryableResolve } from "../../stream/actions/streamReplayErrorRetryableResolve.js"
import { streamReplayServiceCreate } from "../../stream/actions/streamReplayServiceCreate.js"
import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"
import { sessionArchive } from "../actions/sessionArchive.js"
import type { sessionChatAdapterCreate } from "../actions/sessionChatAdapterCreate.js"
import { sessionChatLunaPingAdapterCreate } from "../actions/sessionChatLunaPingAdapterCreate.js"
import { sessionChatLunaPingDetect } from "../actions/sessionChatLunaPingDetect.js"
import { sessionChatPrepare } from "../actions/sessionChatPrepare.js"
import { sessionChatSseStreamCreate } from "../actions/sessionChatSseStreamCreate.js"
import { sessionChatStreamCreate } from "../actions/sessionChatStreamCreate.js"
import { sessionCreate } from "../actions/sessionCreate.js"
import { sessionDelete } from "../actions/sessionDelete.js"
import { sessionListSnapshot } from "../actions/sessionListSnapshot.js"
import { sessionLoad } from "../actions/sessionLoad.js"
import { sessionPin } from "../actions/sessionPin.js"
import { sessionSettledSnapshot } from "../actions/sessionSettledSnapshot.js"
import { sessionShellSnapshot } from "../actions/sessionShellSnapshot.js"
import { sessionJournalRecipientResolverCreate } from "../db/sessionJournalRecipientResolverCreate.js"
import { sessionChatRequestSchema } from "../schema/sessionChatRequestSchema.js"
import { sessionCreateRequestSchema } from "../schema/sessionCreateRequestSchema.js"
import { sessionPinRequestSchema } from "../schema/sessionPinRequestSchema.js"
import { sessionQuerySchema } from "../schema/sessionQuerySchema.js"
import { sessionCreateMutationResponseCreate } from "./sessionCreateMutationResponseCreate.js"
import { sessionPreconditionFailedResponseCreate } from "./sessionPreconditionFailedResponseCreate.js"
import { sessionRepresentationEtagCreate } from "./sessionRepresentationEtagCreate.js"
import { sessionRepresentationSchemaVersion } from "./sessionRepresentationSchemaVersion.js"

type ApiContext = Context<AppEnvironment>
function badRequest(context: ApiContext, message: string) {
  const response = { error: { code: "bad_request", message } } satisfies ApiErrorResponse
  return context.json(response, 400)
}

function notFound(context: ApiContext) {
  const response = {
    error: { code: "not_found", message: "The requested resource was not found." },
  } satisfies ApiErrorResponse
  return context.json(response, 404)
}

function conflict(context: ApiContext, message: string) {
  const response = { error: { code: "conflict", message } } satisfies ApiErrorResponse
  return context.json(response, 409)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function preconditionFailed(context: ApiContext, errorData: string | null | undefined, message: string, op: string) {
  return context.json(sessionPreconditionFailedResponseCreate({ errorData, message, op }), 412)
}

function idempotencyConflict(context: ApiContext) {
  const response = {
    error: { code: "conflict", message: "The idempotency key was already used for a different request." },
  } satisfies ApiErrorResponse
  return context.json(response, 409)
}

async function completeJsonResponse(context: ApiContext, body: unknown, headers: Headers): Promise<Response> {
  const complete = await apiCompleteSnapshotResponseCreate(body, {
    acceptEncoding: context.req.header("Accept-Encoding"),
    dependencies: { compressionStreamCreate: (encoding) => new CompressionStream(encoding) },
    headers,
  })
  if (!complete.success) {
    if (complete.code === "not_acceptable") return new Response(null, { headers, status: 406 })
    return internalServerError(context)
  }
  return complete.data
}

function idempotencyKeyParse(context: ApiContext, bodyKey?: string): string | undefined | Response {
  const headerKey = context.req.header("Idempotency-Key")
  if (headerKey !== undefined && bodyKey !== undefined && headerKey.trim() !== bodyKey)
    return badRequest(context, "The idempotency key is invalid.")
  const rawKey = headerKey ?? bodyKey
  const parsed = v.safeParse(apiIdempotencyKeySchema, rawKey)
  if (!parsed.success && rawKey !== undefined) return badRequest(context, "The idempotency key is invalid.")
  return parsed.success ? parsed.output : undefined
}

type ApiSessionRoutesOptions = {
  database: DatabaseClient
  configurationStore?: ConfigurationStore
  providerAgentCatalog?: ProviderCatalog
  providerEnvironment?: Readonly<Record<string, string | undefined>>
  providerFetch?: NonNullable<ProviderModelDiscoveryOptions["fetch"]>
  projectRootDir?: string
  projectRootDirs?: readonly string[]
  providerDelegationToolLoopCreate?: typeof providerDelegationToolLoopCreate
  providerRuntimeAdapterCreate?: typeof providerRuntimeAdapterCreate
  runCancellationCoordinator?: ReturnType<typeof runCancellationCoordinatorCreate>
  runDelegationExecute?: typeof runDelegationExecute
  runExecutionSnapshotResolve?: typeof runExecutionSnapshotResolve
  sessionChatAdapter?: typeof sessionChatAdapterCreate
  journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  executionConvexClient?: ExecutionConvexClient
  journalCursorCodec: JournalCursorCodec
  streamInactivityTimeoutMs?: number
  streamReplayServiceCreate?: typeof streamReplayServiceCreate
}

const sessionChatDefaultInactivityTimeoutMs = 120_000
const sessionChatRootBudget = { maxChildDepth: 1, maxChildRuns: 1 } as const

function sessionChatRootBudgetResolve(configuration: AgentConfiguration) {
  const scenario =
    configuration.provider === "deterministic" ? providerDeterministicScenarioResolve(configuration.model) : null
  return scenario === null ? sessionChatRootBudget : { ...sessionChatRootBudget, maxAttempts: scenario.maxAttempts }
}

function sessionChatStreamIdCreate(sessionId: string, runId: string): string {
  return `session-chat:${sessionId}:${runId}`
}

async function* sessionChatStreamReplay(
  events: Array<{ id: string; payload: unknown }>,
  eventIds: Array<string | undefined>,
): AsyncGenerator<StreamChunk> {
  let delivered = 0
  for (const event of events) {
    const chunk = event.payload as StreamChunk
    eventIds[delivered] = event.id
    delivered += 1
    yield chunk
  }
}

function sessionChatChildExecutionErrorCreate(code: string, message: string): ExecutionStreamEvent {
  return {
    eventType: "terminal",
    payload: { code, message, status: "error" },
  }
}

function sessionChatChildExecutionStreamCreate(input: {
  adapter: CliProxyApiAdapter
  run: typeof runTable.$inferSelect
  signal: AbortSignal
  task: string
}): AsyncIterable<ExecutionStreamEvent> {
  return sessionChatChildExecutionStreamGenerate(input)
}

async function* sessionChatChildExecutionStreamGenerate(input: {
  adapter: CliProxyApiAdapter
  run: typeof runTable.$inferSelect
  signal: AbortSignal
  task: string
}): AsyncGenerator<ExecutionStreamEvent> {
  try {
    for await (const chunk of input.adapter({
      history: [],
      prompt: input.task,
      runId: input.run.id,
      sessionId: input.run.sessionId,
      signal: input.signal,
    })) {
      if (input.signal.aborted) return

      const providerEvent = providerExecutionEventFromStreamChunk(chunk)
      if (!providerEvent.success) {
        yield sessionChatChildExecutionErrorCreate("child_event_invalid", "The child attempt emitted an invalid event.")
        return
      }
      if (providerEvent.data === null) continue

      const normalized = executionStreamEventNormalize(providerEvent.data)
      if (!normalized.success) {
        yield sessionChatChildExecutionErrorCreate("child_event_invalid", "The child attempt emitted an invalid event.")
        return
      }
      yield normalized.data
    }
  } catch (error) {
    yield sessionChatChildExecutionErrorCreate(
      "provider_failed",
      error instanceof Error ? error.message : "The delegated child attempt failed.",
    )
  }
}

type SessionChatAdmission = {
  attempt?: typeof attemptTable.$inferSelect
  attempts?: Array<typeof attemptTable.$inferSelect>
  run?: typeof runTable.$inferSelect
  runtimeConfiguration?: AgentConfiguration
  agentPrompt?: string
  snapshot: RunExecutionSnapshot
}

async function sessionChatAdmissionResolve(
  userId: string,
  sessionId: string,
  runId: string,
  target: { agentId: string; serverId: string },
  forwardedExecution: unknown,
  options: ApiSessionRoutesOptions,
  executionConvexClient: ExecutionConvexClient,
): Promise<Result<SessionChatAdmission>> {
  const op = "sessionChatAdmissionResolve"
  const loaded = await executionConvexClient.runLoad(userId, sessionId, runId)
  if (loaded.success) {
    const parsedSnapshot = v.safeParse(runExecutionSnapshotSchema, loaded.data.run.snapshot)
    if (!parsedSnapshot.success) return createResultError(op, "The persisted run snapshot is invalid.")
    return createResult({
      attempt: loaded.data.attempt,
      attempts: loaded.data.attempts,
      runtimeConfiguration: options.sessionChatAdapter === undefined ? parsedSnapshot.output.configuration : undefined,
      agentPrompt: parsedSnapshot.output.agentPrompt,
      run: loaded.data.run,
      snapshot: parsedSnapshot.output,
    })
  }
  if (loaded.errorMessage !== "The run could not be found.") return createResultError(op, loaded.errorMessage)
  if (options.configurationStore === undefined) return createResultError(op, "The configuration store is unavailable.")

  const resolved = (options.runExecutionSnapshotResolve ?? runExecutionSnapshotResolve)(
    target,
    options.configurationStore,
    { catalog: options.providerAgentCatalog, execution: forwardedExecution },
  )
  if (!resolved.success) return createResultError(op, resolved.errorMessage)

  if (options.sessionChatAdapter !== undefined)
    return createResult({ agentPrompt: resolved.data.agentPrompt, snapshot: resolved.data })
  return createResult({
    agentPrompt: resolved.data.agentPrompt,
    runtimeConfiguration: resolved.data.configuration,
    snapshot: resolved.data,
  })
}

async function sessionChatReplayEventsLoad(
  attempts: ReadonlyArray<typeof attemptTable.$inferSelect>,
  options: {
    executionConvexClient: ExecutionConvexClient
    inactivityTimeoutMs: number
    sessionId: string
    streamReplayServiceCreate: typeof streamReplayServiceCreate
    userId: string
  },
): Promise<Result<Array<{ id: string; payload: unknown }>>> {
  const op = "sessionChatReplayEventsLoad"
  const events: Array<{ id: string; payload: unknown }> = []

  for (const [attemptIndex, attempt] of attempts.entries()) {
    const replayService = options.streamReplayServiceCreate({
      database: undefined,
      executionConvexClient: options.executionConvexClient,
      inactivityTimeoutMs: options.inactivityTimeoutMs,
      sessionId: options.sessionId,
      streamId: attempt.streamId,
      userId: options.userId,
    })
    const started = await replayService.start()
    if (!started.success) return createResultError(op, started.errorMessage)
    const replay = await replayService.replay({ limit: 100 })
    if (!replay.success) return createResultError(op, replay.errorMessage)
    events.push(
      ...replay.data.events
        .filter(
          (event) =>
            !(attemptIndex < attempts.length - 1 && streamReplayErrorRetryableResolve(event.payload as StreamChunk)),
        )
        .map((event) => ({ id: event.id, payload: event.payload })),
    )
  }

  return createResult(events)
}

export function apiSessionRoutesAdd(api: Hono<AppEnvironment>, options: ApiSessionRoutesOptions): void {
  if (options.database === undefined) throw new Error("The authenticated session database is required.")
  if (options.journalCursorCodec === undefined) throw new Error("The authenticated session cursor codec is required.")
  if (options.journalPostCommitPublish === undefined)
    throw new Error("The authenticated session journal publisher is required.")

  api.get("/sessions", async (context) => {
    const userId = context.var.requestIdentity.userId
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const parsed = apiRequestParse("sessionQueryParse", sessionQuerySchema, context.req.query())
    if (!parsed.success) return badRequest(context, "The session query is invalid.")

    const listOptions = {
      cursor: parsed.data.cursor,
      includeArchived: parsed.data.includeArchived === "1",
      limit: parsed.data.limit,
      search: parsed.data.search === "" ? undefined : parsed.data.search,
    }
    const result = await sessionListSnapshot(options.database, userId, organizationId, listOptions, {
      cursorCodec: options.journalCursorCodec,
    })
    if (!result.success) {
      if (result.errorMessage.includes("cursor")) return badRequest(context, "The session list cursor is invalid.")
      return internalServerError(context)
    }

    const headers = apiRepresentationHeadersCreate(result.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), result.data.etag))
      return new Response(null, { headers, status: 304 })
    return completeJsonResponse(context, result.data, headers)
  })

  api.post("/sessions", async (context) => {
    const userId = context.var.requestIdentity.userId
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionCreateRequestParse", sessionCreateRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The session request is invalid.")

    const requestHash = apiIdempotencyRequestHashCreate({
      metadata: parsed.data.metadata,
      primaryAgentId: parsed.data.primaryAgentId,
      projectPath: parsed.data.projectPath,
      serverId: parsed.data.serverId,
      title: parsed.data.title,
    })
    const result = await sessionCreate(options.database, userId, parsed.data, {
      idempotencyKey: parsed.data.clientRequestId,
      journal: {
        postCommitPublish: options.journalPostCommitPublish,
        resolveRecipients: sessionJournalRecipientResolverCreate({
          organizationId,
          pendingSessionAuthorization: {
            primaryAgentId: parsed.data.primaryAgentId,
            serverId: parsed.data.serverId,
            userId,
          },
        }),
      },
      organizationId,
      projectRootDirs: options.projectRootDir === undefined ? options.projectRootDirs : [options.projectRootDir],
      requestHash,
    })
    if (!result.success) {
      if (result.code === "idempotency_conflict") return idempotencyConflict(context)
      if (result.errorMessage.includes("project path"))
        return badRequest(context, "The session project path is invalid.")
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
        return notFound(context)
      return internalServerError(context)
    }

    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    if (result.data.responseBody !== undefined)
      return context.json(result.data.responseBody, result.data.created && !result.data.replayed ? 201 : 200)
    const response = sessionCreateMutationResponseCreate({ created: result.data.created, session: result.data.session })
    if (!response.success) return internalServerError(context)
    return context.json(response.data, result.data.created && !result.data.replayed ? 201 : 200)
  })

  api.post("/sessions/:sessionId/chat", async (context) => {
    const userId = context.var.requestIdentity.userId
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionChatRequestParse", sessionChatRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The chat request is invalid.")

    const sessionId = context.req.param("sessionId")
    if (parsed.data.threadId !== sessionId) return badRequest(context, "The chat thread must match the session.")

    const finalMessage = parsed.data.messages.at(-1)
    if (finalMessage?.role !== "user" || typeof finalMessage.content !== "string")
      return badRequest(context, "The chat request must end with one plain-text user prompt.")
    const prompt = finalMessage.content.trim()
    if (prompt.length === 0) return badRequest(context, "The chat request must end with one plain-text user prompt.")

    let adapter = options.sessionChatAdapter
    let runtimeConfiguration: AgentConfiguration | undefined
    let admittedRun: typeof runTable.$inferSelect | undefined
    let admittedAttempt: typeof attemptTable.$inferSelect | undefined
    let admittedAttempts: Array<typeof attemptTable.$inferSelect> = []
    let activeRun: typeof runTable.$inferSelect | undefined
    let activeAttempt: typeof attemptTable.$inferSelect | undefined
    let runtimeAgentPrompt: string | undefined
    const loaded = await sessionLoad(options.database, userId, organizationId, sessionId)
    if (!loaded.success)
      return loaded.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    if (loaded.data.session.archivedAt !== null) return conflict(context, "The session is archived.")
    const executionConvexClient = options.executionConvexClient
    if (executionConvexClient === undefined) return internalServerError(context)

    const lunaPing = sessionChatLunaPingDetect({
      primaryAgentId: loaded.data.session.primaryAgentId,
      prompt,
    })
    if (lunaPing) adapter = sessionChatLunaPingAdapterCreate

    if (options.configurationStore !== undefined && !lunaPing) {
      const admission = await sessionChatAdmissionResolve(
        userId,
        sessionId,
        parsed.data.runId,
        { agentId: loaded.data.session.primaryAgentId, serverId: loaded.data.session.serverId },
        parsed.data.forwardedProps?.codelineExecution,
        options,
        executionConvexClient,
      )
      if (!admission.success) {
        if (admission.errorMessage.includes("execution override") || admission.errorMessage.includes("catalog"))
          return badRequest(context, admission.errorMessage)
        return internalServerError(context)
      }
      runtimeConfiguration = admission.data.runtimeConfiguration
      runtimeAgentPrompt = admission.data.agentPrompt

      const runInput = {
        budget: sessionChatRootBudgetResolve(runtimeConfiguration ?? admission.data.snapshot.configuration),
        clientRunId: parsed.data.runId,
        snapshot: admission.data.snapshot,
        streamId: sessionChatStreamIdCreate(sessionId, parsed.data.runId),
      }
      const created = await executionConvexClient.runCreate(userId, sessionId, runInput)
      if (!created.success) {
        if (created.errorMessage.includes("could not be found")) return notFound(context)
        if (created.errorMessage.includes("conflicts")) return conflict(context, created.errorMessage)
        return internalServerError(context)
      }
      admittedRun = created.data.run
      admittedAttempt = created.data.attempt
      if (admission.data.attempts !== undefined) {
        admittedAttempts = admission.data.attempts
      } else {
        const persisted = await executionConvexClient.runLoad(userId, sessionId, parsed.data.runId)
        admittedAttempts = persisted.success ? persisted.data.attempts : [created.data.attempt]
      }
      activeRun = admittedRun
      activeAttempt = admittedAttempt
    } else if (adapter === undefined) {
      if (options.providerAgentCatalog?.agents.some((agent) => agent.id === loaded.data.session.primaryAgentId)) {
        const resolved = providerAgentCatalogExecutionResolve(
          options.providerAgentCatalog,
          loaded.data.session.primaryAgentId,
          loaded.data.agent.configuration,
          parsed.data.forwardedProps?.codelineExecution,
        )
        if (!resolved.success) return badRequest(context, resolved.errorMessage)
        runtimeConfiguration = resolved.data.configuration
        runtimeAgentPrompt = resolved.data.prompt
      } else {
        const resolvedConfiguration = agentConfigurationExecutionResolve(
          loaded.data.agent.configuration,
          parsed.data.forwardedProps?.codelineExecution,
          loaded.data.session.primaryAgentId,
        )
        if (!resolvedConfiguration.success) {
          if (resolvedConfiguration.errorMessage.includes("execution override"))
            return badRequest(context, resolvedConfiguration.errorMessage)
          return internalServerError(context)
        }

        runtimeConfiguration = resolvedConfiguration.data
      }
    }

    if (options.configurationStore === undefined && options.providerAgentCatalog !== undefined) {
      const agent = options.providerAgentCatalog.agents.find(({ id }) => id === loaded.data.session.primaryAgentId)
      runtimeAgentPrompt = agent?.prompt
    }

    const delegatedTaskExecute = async (input: {
      agentId?: string
      signal: AbortSignal
      task: string
      toolCallId: string
    }) => {
      if (activeRun === undefined || activeAttempt === undefined) throw new Error("The parent chat run is unavailable.")

      let childSnapshot: RunExecutionSnapshot | undefined
      if (input.agentId !== undefined) {
        if (options.configurationStore === undefined) throw new Error("The child agent configuration is unavailable.")
        const parentSnapshot = v.safeParse(runExecutionSnapshotSchema, activeRun.snapshot)
        if (!parentSnapshot.success) throw new Error("The parent execution snapshot is invalid.")
        const childCatalogAgent = options.providerAgentCatalog?.agents.some(({ id }) => id === input.agentId)
        const resolved = (options.runExecutionSnapshotResolve ?? runExecutionSnapshotResolve)(
          { agentId: input.agentId, serverId: parentSnapshot.output.target.serverId },
          options.configurationStore,
          {
            catalog: options.providerAgentCatalog,
            configurationRevision: parentSnapshot.output.configurationRevision,
            ...(childCatalogAgent === true ? { configuration: parentSnapshot.output.configuration } : {}),
          },
        )
        if (!resolved.success) throw new Error(resolved.errorMessage)
        childSnapshot = resolved.data
      }

      const childExecute = await (options.runDelegationExecute ?? runDelegationExecute)(
        {
          delegationKey: input.toolCallId,
          parentAttempt: activeAttempt,
          parentRun: activeRun,
          ...(childSnapshot === undefined ? {} : { childSnapshot }),
          task: input.task,
        },
        {
          attemptStreamCreate: ({ run, signal, task }) => {
            const snapshot = v.safeParse(runExecutionSnapshotSchema, run.snapshot)
            if (!snapshot.success) throw new Error("The child execution snapshot is invalid.")
            const resolved = providerRuntimeAdapterResolve(snapshot.output.configuration, {
              environment: options.providerEnvironment ?? Bun.env,
              ...(options.providerFetch === undefined ? {} : { fetch: options.providerFetch }),
              runtimeAdapterCreate: options.providerRuntimeAdapterCreate,
              systemPrompt: snapshot.output.agentPrompt,
            })
            if (!resolved.success) throw new Error(resolved.errorMessage)
            return sessionChatChildExecutionStreamCreate({ adapter: resolved.data, run, signal, task })
          },
          cancellationRegister: (registration) =>
            options.runCancellationCoordinator?.register(registration) ?? (() => undefined),
          childCreate: (childInput) => executionConvexClient.runChildCreate(userId, sessionId, childInput),
          delegationFinalize: (delegationId, result) =>
            executionConvexClient.runDelegationFinalize(userId, sessionId, delegationId, result),
          retryAttemptCreate: (runId, retryOptions) =>
            executionConvexClient.runRetryAttemptCreate(userId, sessionId, runId, retryOptions),
          runTransition: (runId, transition) =>
            executionConvexClient.runTransition(userId, sessionId, runId, transition),
          streamAppend: (event) => executionConvexClient.streamAppend(userId, sessionId, event),
        },
      )
      if (!childExecute.success) throw new Error(childExecute.errorMessage)
      if (childExecute.data.status !== "succeeded") throw new Error(childExecute.data.failure.message)
      return childExecute.data.text
    }

    const prepared = await sessionChatPrepare(
      undefined,
      userId,
      sessionId,
      {
        clientRequestId: parsed.data.runId,
        content: prompt,
      },
      executionConvexClient,
    )
    if (!prepared.success) {
      if (prepared.errorMessage.includes("could not be found")) return notFound(context)
      if (prepared.errorMessage.includes("already used") || prepared.errorMessage.includes("archived"))
        return conflict(context, prepared.errorMessage)
      return internalServerError(context)
    }

    const executionAbortController = new AbortController()
    const requestSignal = context.req.raw.signal

    const eventIds: Array<string | undefined> = []
    const replayServiceCreate = options.streamReplayServiceCreate ?? streamReplayServiceCreate
    const inactivityTimeoutMs = options.streamInactivityTimeoutMs ?? sessionChatDefaultInactivityTimeoutMs
    let stream: AsyncIterable<StreamChunk>
    const pendingEventIds: Array<string> = []
    const initialStreamId = admittedAttempt?.streamId ?? sessionChatStreamIdCreate(sessionId, parsed.data.runId)
    const initialReplayService = replayServiceCreate({
      database: undefined,
      executionConvexClient,
      inactivityTimeoutMs,
      sessionId,
      streamId: initialStreamId,
      userId,
    })
    const started = await initialReplayService.start()
    if (!started.success) return internalServerError(context)

    let executionClaimed = admittedRun === undefined
    if (admittedRun !== undefined && admittedAttempt !== undefined && admittedRun.status === "accepted") {
      const claimed = await executionConvexClient.runTransition(userId, sessionId, admittedRun.id, {
        status: "running",
      })
      if (!claimed.success) return internalServerError(context)
      admittedRun = claimed.data.run
      admittedAttempt = claimed.data.attempt
      activeRun = claimed.data.run
      activeAttempt = claimed.data.attempt
      executionClaimed = claimed.data.changed
    }

    if (admittedRun !== undefined && !executionClaimed) {
      const replay = await sessionChatReplayEventsLoad(admittedAttempts, {
        executionConvexClient,
        inactivityTimeoutMs,
        sessionId,
        streamReplayServiceCreate: replayServiceCreate,
        userId,
      })
      if (!replay.success) return internalServerError(context)
      stream = sessionChatStreamReplay(replay.data, eventIds)
    } else if (started.data.checkpoint.lastSequence > 0) {
      const replay = await initialReplayService.replay({ limit: 100 })
      if (!replay.success) return internalServerError(context)
      stream = sessionChatStreamReplay(replay.data.events, eventIds)
    } else {
      if (adapter === undefined) {
        if (runtimeConfiguration === undefined) return internalServerError(context)
        const resolved = providerRuntimeAdapterResolve(runtimeConfiguration, {
          environment: options.providerEnvironment ?? Bun.env,
          ...(options.providerFetch === undefined ? {} : { fetch: options.providerFetch }),
          runtimeAdapterCreate: options.providerRuntimeAdapterCreate,
          ...(runtimeAgentPrompt === undefined ? {} : { systemPrompt: runtimeAgentPrompt }),
        })
        if (!resolved.success) return internalServerError(context)
        const deterministicScenario =
          runtimeConfiguration.provider === "deterministic"
            ? providerDeterministicScenarioResolve(runtimeConfiguration.model)
            : null
        adapter =
          activeRun !== undefined && deterministicScenario === null
            ? providerDelegationAdapterCreate({
                adapter: resolved.data,
                delegateTask: delegatedTaskExecute,
                model: runtimeConfiguration.model,
                toolLoopCreate: options.providerDelegationToolLoopCreate,
              })
            : resolved.data
      }

      const unregisterCancellation =
        admittedRun === undefined
          ? undefined
          : options.runCancellationCoordinator?.register({
              controller: executionAbortController,
              runId: admittedRun.id,
              sessionId,
              userId,
            })
      stream = (async function* () {
        let currentAttempt = admittedAttempt
        let replayService = initialReplayService

        try {
          while (true) {
            let nextAttempt: typeof attemptTable.$inferSelect | undefined
            const attemptStream = sessionChatStreamCreate({
              adapter: adapter as NonNullable<typeof adapter>,
              attemptOrdinal: currentAttempt?.ordinal,
              database: undefined,
              executionConvexClient,
              history: prepared.data.history,
              onEventId: (_sequence, eventId) => {
                pendingEventIds.push(eventId)
              },
              onTerminal: async (terminal) => {
                if (activeRun === undefined || currentAttempt === undefined) return
                const transitioned = await executionConvexClient.runTransition(
                  userId,
                  sessionId,
                  activeRun.id,
                  terminal,
                )
                if (!transitioned.success) throw new Error(transitioned.errorMessage)
                activeRun = transitioned.data.run
                activeAttempt = transitioned.data.attempt
                if (terminal.status !== "failed" || terminal.failure === undefined) return
                if (runFailureClassResolve(terminal.failure) !== "retryable") return

                const retry = await executionConvexClient.runRetryAttemptCreate(userId, sessionId, activeRun.id)
                if (!retry.success) {
                  if (retry.errorMessage.includes("The run retry was not admitted:")) return
                  throw new Error(retry.errorMessage)
                }
                if (retry.data.attempt.status !== "accepted") return
                nextAttempt = retry.data.attempt
                activeRun = retry.data.run
                activeAttempt = retry.data.attempt
                if (!admittedAttempts.some(({ id }) => id === retry.data.attempt.id)) {
                  admittedAttempts.push(retry.data.attempt)
                }
              },
              prompt,
              replayService,
              requestId: parsed.data.runId,
              runId: parsed.data.runId,
              sessionId,
              signal: executionAbortController.signal,
              userId,
            })

            for await (const chunk of attemptStream) {
              const eventId = pendingEventIds.shift()
              if (nextAttempt !== undefined && streamReplayErrorRetryableResolve(chunk)) continue
              eventIds[eventIds.length] = eventId
              yield chunk
            }
            if (nextAttempt === undefined) return

            currentAttempt = nextAttempt
            const nextReplayService = replayServiceCreate({
              database: undefined,
              executionConvexClient,
              inactivityTimeoutMs,
              sessionId,
              streamId: nextAttempt.streamId,
              userId,
            })
            const nextStarted = await nextReplayService.start()
            if (!nextStarted.success) throw new Error(nextStarted.errorMessage)
            replayService = nextReplayService

            if (activeRun !== undefined) {
              const transitioned = await executionConvexClient.runTransition(userId, sessionId, activeRun.id, {
                status: "running",
              })
              if (!transitioned.success) throw new Error(transitioned.errorMessage)
              activeRun = transitioned.data.run
              activeAttempt = transitioned.data.attempt
            }
          }
        } finally {
          unregisterCancellation?.()
        }
      })()
    }
    const sse = sessionChatSseStreamCreate(stream, {
      getId: (_chunk, index) => eventIds[index],
      requestSignal,
    })

    return new Response(sse, {
      headers: {
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream",
      },
    })
  })

  api.get("/sessions/:sessionId/snapshot", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const result = await sessionSettledSnapshot(
      options.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      {
        cursorCodec: options.journalCursorCodec,
        etagCreate: sessionRepresentationEtagCreate,
        schemaVersion: sessionRepresentationSchemaVersion,
      },
    )
    if (!result.success) {
      if (result.code === "session_active") return conflict(context, result.errorMessage)
      if (result.code === "session_not_found" || result.errorMessage.includes("could not be found"))
        return notFound(context)
      return internalServerError(context)
    }

    const headers = apiRepresentationHeadersCreate(result.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), result.data.etag))
      return new Response(null, { headers, status: 304 })
    return completeJsonResponse(context, result.data, headers)
  })

  api.get("/sessions/:sessionId", async (context) => {
    const userId = context.var.requestIdentity.userId
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)

    const result = await sessionShellSnapshot(
      options.database,
      userId,
      organizationId,
      context.req.param("sessionId"),
      { cursorCodec: options.journalCursorCodec },
    )
    if (!result.success)
      return result.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)

    const headers = apiRepresentationHeadersCreate(result.data.etag)
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), result.data.etag))
      return new Response(null, { headers, status: 304 })
    return completeJsonResponse(context, result.data, headers)
  })

  api.patch("/sessions/:sessionId/pin", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    const body = await context.req.json<unknown>().catch(() => undefined)
    const parsed = apiRequestParse("sessionPinRequestParse", sessionPinRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The session pin request is invalid.")

    if (organizationId === undefined) return notFound(context)
    const expectedEtag = apiIfMatchEtagParse(context.req.header("If-Match"))
    if (!expectedEtag.success) return badRequest(context, "The If-Match header is invalid.")
    const idempotencyKey = idempotencyKeyParse(context, parsed.data.idempotencyKey)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined
        ? undefined
        : apiIdempotencyRequestHashCreate({ ifMatch: expectedEtag.data, pinned: parsed.data.pinned })
    const result = await sessionPin(
      options.database,
      context.var.requestIdentity.userId,
      context.req.param("sessionId"),
      parsed.data.pinned,
      {
        expectedEtag: expectedEtag.data,
        idempotencyKey,
        journal: {
          postCommitPublish: options.journalPostCommitPublish,
          resolveRecipients: sessionJournalRecipientResolverCreate({ organizationId }),
        },
        organizationId,
        requireIfMatch: true,
        requestHash,
      },
    )
    if (!result.success) {
      if (result.code === "idempotency_conflict") return idempotencyConflict(context)
      if (result.code === "precondition_failed")
        return preconditionFailed(
          context,
          result.errorData,
          "The session changed before it could be pinned.",
          "sessionPin",
        )
      if (result.errorMessage === "The session is archived.") return conflict(context, result.errorMessage)
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
        return notFound(context)
      return internalServerError(context)
    }
    if (result.data.responseBody === undefined) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(result.data.responseBody.etag)
    headers.set("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return completeJsonResponse(context, result.data.responseBody, headers)
  })

  api.post("/sessions/:sessionId/archive", async (context) => {
    const userId = context.var.requestIdentity.userId
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const expectedEtag = apiIfMatchEtagParse(context.req.header("If-Match"))
    if (!expectedEtag.success) return badRequest(context, "The If-Match header is invalid.")
    const idempotencyKey = idempotencyKeyParse(context)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined ? undefined : apiIdempotencyRequestHashCreate({ ifMatch: expectedEtag.data })
    const result = await sessionArchive(options.database, userId, context.req.param("sessionId"), {
      expectedEtag: expectedEtag.data,
      idempotencyKey,
      journal: {
        postCommitPublish: options.journalPostCommitPublish,
        resolveRecipients: sessionJournalRecipientResolverCreate({ organizationId }),
      },
      organizationId,
      requireIfMatch: true,
      requestHash,
    })
    if (!result.success) {
      if (result.code === "idempotency_conflict") return idempotencyConflict(context)
      if (result.code === "precondition_failed")
        return preconditionFailed(
          context,
          result.errorData,
          "The session changed before it could be archived.",
          "sessionArchive",
        )
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
        return notFound(context)
      return internalServerError(context)
    }
    if (result.data.responseBody === undefined) return internalServerError(context)
    const headers = apiRepresentationHeadersCreate(result.data.responseBody.etag)
    headers.set("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return completeJsonResponse(context, result.data.responseBody, headers)
  })

  api.delete("/sessions/:sessionId", async (context) => {
    const userId = context.var.requestIdentity.userId
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const expectedEtag = apiIfMatchEtagParse(context.req.header("If-Match"))
    if (!expectedEtag.success) return badRequest(context, "The If-Match header is invalid.")
    const idempotencyKey = idempotencyKeyParse(context)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined ? undefined : apiIdempotencyRequestHashCreate({ ifMatch: expectedEtag.data })
    const result = await sessionDelete(options.database, userId, context.req.param("sessionId"), {
      expectedEtag: expectedEtag.data,
      idempotencyKey,
      journal: {
        postCommitPublish: options.journalPostCommitPublish,
        resolveRecipients: sessionJournalRecipientResolverCreate({ organizationId }),
      },
      organizationId,
      requireIfMatch: true,
      requestHash,
    })
    if (!result.success) {
      if (result.code === "idempotency_conflict") return idempotencyConflict(context)
      if (result.code === "precondition_failed")
        return preconditionFailed(
          context,
          result.errorData,
          "The session changed before it could be deleted.",
          "sessionDelete",
        )
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
        return notFound(context)
      return internalServerError(context)
    }
    if (result.data.responseBody === undefined) return internalServerError(context)
    const headers = new Headers({
      "Cache-Control": "private, no-cache",
      Vary: "Cookie, Accept-Encoding",
    })
    headers.set("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    return completeJsonResponse(context, result.data.responseBody, headers)
  })
}
