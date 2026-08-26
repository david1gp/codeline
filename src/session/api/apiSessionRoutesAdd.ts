import { createResult, createResultError, type Result } from "@adaptive-ds/result"
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
import type { DatabaseClient } from "../../database/databaseClient.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
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
import { runActiveRegistryCreate } from "../../run/actions/runActiveRegistryCreate.js"
import { runCancellationCoordinatorCreate } from "../../run/actions/runCancellationCoordinatorCreate.js"
import { runChildCreate } from "../../run/actions/runChildCreate.js"
import { runCreate } from "../../run/actions/runCreate.js"
import { runDelegationExecute } from "../../run/actions/runDelegationExecute.js"
import { runDelegationFinalize } from "../../run/actions/runDelegationFinalize.js"
import { runExecutionManifestChildResolve } from "../../run/actions/runExecutionManifestChildResolve.js"
import { runExecutionSnapshotResolve } from "../../run/actions/runExecutionSnapshotResolve.js"
import { runFailureClassResolve } from "../../run/actions/runFailureClassResolve.js"
import { runLoad } from "../../run/actions/runLoad.js"
import { runProviderOutputCreate } from "../../run/actions/runProviderOutputCreate.js"
import { runRetryAttemptCreate } from "../../run/actions/runRetryAttemptCreate.js"
import { runTransition } from "../../run/actions/runTransition.js"
import type { attemptTable } from "../../run/db/attemptTable.js"
import type { runTable } from "../../run/db/runTable.js"
import type { RunExecutionSnapshot } from "../../run/schema/runExecutionSnapshotSchema.js"
import { runExecutionSnapshotSchema } from "../../run/schema/runExecutionSnapshotSchema.js"
import { executionStreamEventNormalize } from "../../stream/actions/executionStreamEventNormalize.js"
import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"
import { sessionArchive } from "../actions/sessionArchive.js"
import type { sessionChatAdapterCreate } from "../actions/sessionChatAdapterCreate.js"
import { sessionChatLunaPingAdapterCreate } from "../actions/sessionChatLunaPingAdapterCreate.js"
import { sessionChatLunaPingDetect } from "../actions/sessionChatLunaPingDetect.js"
import { sessionChatPrepare } from "../actions/sessionChatPrepare.js"
import { sessionChatStreamCreate } from "../actions/sessionChatStreamCreate.js"
import { sessionCreate } from "../actions/sessionCreate.js"
import { sessionDelete } from "../actions/sessionDelete.js"
import { sessionExecutionSelectionCanonicalize } from "../actions/sessionExecutionSelectionCanonicalize.js"
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
import {
  type SessionChatCommandResponse,
  sessionChatCommandResponseSchema,
} from "./sessionChatCommandResponseSchema.js"
import { sessionCreateMutationResponseCreate } from "./sessionCreateMutationResponseCreate.js"
import { sessionMutationEtagResolve } from "./sessionMutationEtagResolve.js"
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

async function completeJsonResponse(
  context: ApiContext,
  body: unknown,
  headers: Headers,
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>,
): Promise<Response> {
  const complete = await apiCompleteSnapshotResponseCreate(body, {
    acceptEncoding: context.req.header("Accept-Encoding"),
    dependencies: { compressionStreamCreate: (encoding) => new CompressionStream(encoding) },
    headers,
    metricsCollector,
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
  projectRootDirs?: readonly string[]
  providerDelegationToolLoopCreate?: typeof providerDelegationToolLoopCreate
  providerRuntimeAdapterCreate?: typeof providerRuntimeAdapterCreate
  runActiveRegistry?: ReturnType<typeof runActiveRegistryCreate>
  runCancellationCoordinator?: ReturnType<typeof runCancellationCoordinatorCreate>
  runChildCreate?: typeof runChildCreate
  runDelegationExecute?: typeof runDelegationExecute
  runDelegationFinalize?: typeof runDelegationFinalize
  runExecutionSnapshotResolve?: typeof runExecutionSnapshotResolve
  runCreate?: typeof runCreate
  runLoad?: typeof runLoad
  runRetryAttemptCreate?: typeof runRetryAttemptCreate
  runTransition?: typeof runTransition
  sessionChatAdapter?: typeof sessionChatAdapterCreate
  journalPostCommitPublish: ReturnType<typeof journalPostCommitPublishCreate>
  journalCursorCodec: JournalCursorCodec
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
}

const sessionChatRootBudget = { maxChildDepth: 1, maxChildRuns: 1 } as const

function sessionChatRootBudgetResolve(configuration: AgentConfiguration) {
  const scenario =
    configuration.provider === "deterministic" ? providerDeterministicScenarioResolve(configuration.model) : null
  return scenario === null ? sessionChatRootBudget : { ...sessionChatRootBudget, maxAttempts: scenario.maxAttempts }
}

function sessionChatStreamIdCreate(sessionId: string, runId: string): string {
  return `session-chat:${sessionId}:${runId}`
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
  persistedExecutionSelection: unknown,
  options: ApiSessionRoutesOptions,
  runLoadAction: typeof runLoad,
): Promise<Result<SessionChatAdmission>> {
  const op = "sessionChatAdmissionResolve"
  const loaded = await runLoadAction(options.database, userId, sessionId, runId)
  if (loaded.success) {
    const parsedSnapshot = v.safeParse(runExecutionSnapshotSchema, loaded.data.run.snapshot)
    if (!parsedSnapshot.success) return createResultError(op, "The persisted run snapshot is invalid.")
    return createResult({
      attempt: loaded.data.attempt,
      runtimeConfiguration: options.sessionChatAdapter === undefined ? parsedSnapshot.output.configuration : undefined,
      agentPrompt: parsedSnapshot.output.agentPrompt,
      run: loaded.data.run,
      snapshot: parsedSnapshot.output,
    })
  }
  if (loaded.errorMessage !== "The run could not be found.") return createResultError(op, loaded.errorMessage)
  if (options.configurationStore === undefined) return createResultError(op, "The configuration store is unavailable.")

  const executionSelection = sessionExecutionSelectionCanonicalize(persistedExecutionSelection, target.agentId, {
    catalog: options.providerAgentCatalog,
  })
  if (!executionSelection.success) return createResultError(op, "The persisted session execution selection is invalid.")

  const resolved = (options.runExecutionSnapshotResolve ?? runExecutionSnapshotResolve)(
    target,
    options.configurationStore,
    {
      catalog: options.providerAgentCatalog,
      execution: forwardedExecution,
      ...(executionSelection.data === null ? {} : { executionSelection: executionSelection.data }),
    },
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

function sessionChatCommandResponseCreate(runId: string, sessionId: string): Result<SessionChatCommandResponse> {
  const parsed = v.safeParse(sessionChatCommandResponseSchema, { runId, sessionId })
  if (!parsed.success)
    return createResultError("sessionChatCommandResponseCreate", "The chat command response is invalid.")
  return createResult(parsed.output)
}

export function apiSessionRoutesAdd(api: Hono<AppEnvironment>, options: ApiSessionRoutesOptions): void {
  if (options.database === undefined) throw new Error("The authenticated session database is required.")
  if (options.journalCursorCodec === undefined) throw new Error("The authenticated session cursor codec is required.")
  if (options.journalPostCommitPublish === undefined)
    throw new Error("The authenticated session journal publisher is required.")

  const runCreateAction = options.runCreate ?? runCreate
  const runLoadAction = options.runLoad ?? runLoad
  const runChildCreateAction = options.runChildCreate ?? runChildCreate
  const runDelegationFinalizeAction = options.runDelegationFinalize ?? runDelegationFinalize
  const runRetryAttemptCreateAction = options.runRetryAttemptCreate ?? runRetryAttemptCreate
  const runTransitionAction = options.runTransition ?? runTransition

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
      executionSelection: parsed.data.executionSelection,
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
      providerAgentCatalog: options.providerAgentCatalog,
      projectRootDirs: options.projectRootDirs,
      requestHash,
    })
    if (!result.success) {
      if (result.code === "idempotency_conflict") return idempotencyConflict(context)
      if (result.errorMessage.includes("execution selection"))
        return badRequest(context, "The session execution selection is invalid.")
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
    let activeRun: typeof runTable.$inferSelect | undefined
    let activeAttempt: typeof attemptTable.$inferSelect | undefined
    let runtimeAgentPrompt: string | undefined
    const loaded = await sessionLoad(options.database, userId, organizationId, sessionId)
    if (!loaded.success)
      return loaded.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    if (loaded.data.session.archivedAt !== null) return conflict(context, "The session is archived.")
    const lunaPing = sessionChatLunaPingDetect({
      primaryAgentId: loaded.data.session.primaryAgentId,
      prompt,
    })
    if (lunaPing) adapter = sessionChatLunaPingAdapterCreate

    if (options.configurationStore !== undefined) {
      const admission = await sessionChatAdmissionResolve(
        userId,
        sessionId,
        parsed.data.runId,
        { agentId: loaded.data.session.primaryAgentId, serverId: loaded.data.session.serverId },
        parsed.data.forwardedProps?.codelineExecution,
        loaded.data.session.executionSelection,
        options,
        runLoadAction,
      )
      if (!admission.success) {
        if (
          admission.errorMessage.includes("execution override") ||
          admission.errorMessage.includes("execution selection") ||
          admission.errorMessage.includes("catalog")
        )
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
      const created = await runCreateAction(options.database, userId, sessionId, runInput)
      if (!created.success) {
        if (created.errorMessage.includes("could not be found")) return notFound(context)
        if (created.errorMessage.includes("conflicts")) return conflict(context, created.errorMessage)
        return internalServerError(context)
      }
      admittedRun = created.data.run
      admittedAttempt = created.data.attempt
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

    const delegatedTaskExecute = async (
      input: {
        agentId?: string
        signal: AbortSignal
        task: string
        toolCallId: string
      },
      parent?: { attempt: typeof attemptTable.$inferSelect; run: typeof runTable.$inferSelect },
    ) => {
      const parentRun = parent?.run ?? activeRun
      const parentAttempt = parent?.attempt ?? activeAttempt
      if (parentRun === undefined || parentAttempt === undefined) throw new Error("The parent chat run is unavailable.")

      let childSnapshot: RunExecutionSnapshot | undefined
      if (input.agentId !== undefined) {
        if (options.configurationStore === undefined) throw new Error("The child agent configuration is unavailable.")
        const parentSnapshot = v.safeParse(runExecutionSnapshotSchema, parentRun.snapshot)
        if (!parentSnapshot.success) throw new Error("The parent execution snapshot is invalid.")
        const childManifest = runExecutionManifestChildResolve(parentSnapshot.output.executionManifest, input.agentId)
        if (!childManifest.success) throw new Error(childManifest.errorMessage)
        const childCatalogAgent = options.providerAgentCatalog?.agents.some(({ id }) => id === input.agentId)
        const resolved = (options.runExecutionSnapshotResolve ?? runExecutionSnapshotResolve)(
          { agentId: input.agentId, serverId: parentSnapshot.output.target.serverId },
          options.configurationStore,
          {
            catalog: options.providerAgentCatalog,
            configurationRevision: parentSnapshot.output.configurationRevision,
            executionManifest: childManifest.data,
            ...(childCatalogAgent === true ? { configuration: parentSnapshot.output.configuration } : {}),
          },
        )
        if (!resolved.success) throw new Error(resolved.errorMessage)
        childSnapshot = resolved.data
      }

      const childExecute = await (options.runDelegationExecute ?? runDelegationExecute)(
        {
          delegationKey: input.toolCallId,
          parentAttempt,
          parentRun,
          ...(childSnapshot === undefined ? {} : { childSnapshot }),
          task: input.task,
        },
        {
          attemptStreamCreate: ({ attempt, run, signal, task }) => {
            const snapshot = v.safeParse(runExecutionSnapshotSchema, run.snapshot)
            if (!snapshot.success) throw new Error("The child execution snapshot is invalid.")
            const resolved = providerRuntimeAdapterResolve(snapshot.output.configuration, {
              environment: options.providerEnvironment ?? Bun.env,
              ...(options.providerFetch === undefined ? {} : { fetch: options.providerFetch }),
              runtimeAdapterCreate: options.providerRuntimeAdapterCreate,
              systemPrompt: snapshot.output.agentPrompt,
            })
            if (!resolved.success) throw new Error(resolved.errorMessage)
            const adapter = providerDelegationAdapterCreate({
              adapter: resolved.data,
              delegateTask: (input) => delegatedTaskExecute(input, { attempt, run }),
              model: snapshot.output.configuration.model,
              toolLoopCreate: options.providerDelegationToolLoopCreate,
            })
            return sessionChatChildExecutionStreamCreate({ adapter, run, signal, task })
          },
          cancellationRegister: (registration) =>
            options.runActiveRegistry !== undefined
              ? (() => {
                  const registered = options.runActiveRegistry.register(registration)
                  if (!registered.success) throw new Error(registered.errorMessage)
                  return registered.data.cleanup
                })()
              : (options.runCancellationCoordinator?.register(registration) ?? (() => undefined)),
          childCreate: (childInput) => runChildCreateAction(options.database, userId, sessionId, childInput),
          delegationFinalize: (delegationId, result) =>
            runDelegationFinalizeAction(options.database, userId, sessionId, delegationId, result),
          retryAttemptCreate: (runId, retryOptions) =>
            runRetryAttemptCreateAction(options.database, userId, sessionId, runId, retryOptions),
          runTransition: (runId, transition) =>
            runTransitionAction(options.database, userId, sessionId, runId, transition),
          providerOutputCreate: ({ runId }) =>
            runProviderOutputCreate({
              database: options.database,
              journalPostCommitPublish: options.journalPostCommitPublish,
              requestId: `${parsed.data.runId}:child:${runId}`,
              runId,
              scheduler: {
                clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
                setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
              },
              sessionId,
              userId,
            }),
        },
      )
      if (!childExecute.success) throw new Error(childExecute.errorMessage)
      if (childExecute.data.status !== "succeeded") throw new Error(childExecute.data.failure.message)
      return childExecute.data.text
    }

    const prepared = await sessionChatPrepare(options.database, userId, sessionId, {
      clientRequestId: parsed.data.runId,
      content: prompt,
    })
    if (!prepared.success) {
      if (prepared.errorMessage.includes("could not be found")) return notFound(context)
      if (prepared.errorMessage.includes("already used") || prepared.errorMessage.includes("archived"))
        return conflict(context, prepared.errorMessage)
      return internalServerError(context)
    }

    let executionClaimed = admittedRun === undefined
    if (admittedRun !== undefined && admittedAttempt !== undefined && admittedRun.status === "accepted") {
      const claimed = await runTransitionAction(options.database, userId, sessionId, admittedRun.id, {
        status: "running",
      })
      if (!claimed.success) return internalServerError(context)
      admittedRun = claimed.data.run
      admittedAttempt = claimed.data.attempt
      activeRun = claimed.data.run
      activeAttempt = claimed.data.attempt
      executionClaimed = claimed.data.changed
    }

    const commandRunId = admittedRun?.id ?? parsed.data.runId
    const commandResponse = sessionChatCommandResponseCreate(commandRunId, sessionId)
    if (!commandResponse.success) return internalServerError(context)
    if (admittedRun !== undefined && !executionClaimed) return context.json(commandResponse.data)

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

    let executionSignal: AbortSignal
    let unregisterCancellation: (() => void) | undefined
    const createdProviderOutput =
      admittedRun === undefined
        ? undefined
        : runProviderOutputCreate({
            database: options.database,
            journalPostCommitPublish: options.journalPostCommitPublish,
            requestId: parsed.data.runId,
            runId: admittedRun.id,
            scheduler: {
              clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
              setTimeout: (handler, timeoutMs) => setTimeout(handler, timeoutMs),
            },
            sessionId,
            userId,
          })
    let providerOutput = createdProviderOutput
    if (options.runActiveRegistry !== undefined) {
      const registered = options.runActiveRegistry.register({
        ...(createdProviderOutput === undefined ? {} : { providerOutput: createdProviderOutput }),
        runId: commandRunId,
        sessionId,
        userId,
      })
      if (!registered.success) return internalServerError(context)
      providerOutput = registered.data.lifecycle.providerOutput
      executionSignal = registered.data.lifecycle.signal
      unregisterCancellation = registered.data.cleanup
    } else {
      const executionAbortController = new AbortController()
      executionSignal = executionAbortController.signal
      unregisterCancellation = options.runCancellationCoordinator?.register({
        controller: executionAbortController,
        runId: commandRunId,
        sessionId,
        userId,
      })
    }

    const execute = async (): Promise<void> => {
      let currentAttempt = admittedAttempt

      try {
        while (true) {
          let nextAttempt: typeof attemptTable.$inferSelect | undefined
          const attemptStream = sessionChatStreamCreate({
            adapter: adapter as NonNullable<typeof adapter>,
            attemptOrdinal: currentAttempt?.ordinal,
            database: options.database,
            history: prepared.data.history,
            onTerminal: async (terminal) => {
              if (activeRun === undefined || currentAttempt === undefined) return
              const providerFailureFinalize = async (): Promise<void> => {
                if (providerOutput === undefined || terminal.failure === undefined) return
                const finalized = await providerOutput.finalize({
                  failure: terminal.failure,
                  messageId: terminal.messageId,
                  status: "failed",
                })
                if (!finalized.success) throw new Error(finalized.errorMessage)
                activeRun = finalized.data.run
                activeAttempt = finalized.data.attempt
              }
              if (providerOutput !== undefined && terminal.status === "failed" && terminal.failure !== undefined) {
                if (runFailureClassResolve(terminal.failure) !== "retryable") {
                  await providerFailureFinalize()
                  return
                }
              }
              if (providerOutput !== undefined && terminal.status === "succeeded") {
                const finalized = await providerOutput.finalize({
                  assistantText: terminal.assistantText,
                  messageId: terminal.messageId,
                  status: terminal.status,
                })
                if (!finalized.success) throw new Error(finalized.errorMessage)
                activeRun = finalized.data.run
                activeAttempt = finalized.data.attempt
                return
              }
              if (providerOutput !== undefined && terminal.status === "aborted") {
                const finalized = await providerOutput.finalize({
                  messageId: terminal.messageId,
                  reason: "The chat run was aborted.",
                  status: terminal.status,
                })
                if (!finalized.success) throw new Error(finalized.errorMessage)
                activeRun = finalized.data.run
                activeAttempt = finalized.data.attempt
                return
              }
              const transitioned = await runTransitionAction(options.database, userId, sessionId, activeRun.id, {
                failure: terminal.failure,
                status: terminal.status,
              })
              if (!transitioned.success) throw new Error(transitioned.errorMessage)
              activeRun = transitioned.data.run
              activeAttempt = transitioned.data.attempt
              if (terminal.status !== "failed" || terminal.failure === undefined) return
              if (runFailureClassResolve(terminal.failure) !== "retryable") return

              const retry = await runRetryAttemptCreateAction(options.database, userId, sessionId, activeRun.id)
              if (!retry.success) {
                if (retry.errorMessage.includes("The run retry was not admitted:")) {
                  await providerFailureFinalize()
                  return
                }
                throw new Error(retry.errorMessage)
              }
              if (retry.data.attempt.status !== "accepted") {
                await providerFailureFinalize()
                return
              }
              nextAttempt = retry.data.attempt
              activeRun = retry.data.run
              activeAttempt = retry.data.attempt
            },
            prompt,
            providerOutput,
            requestId: parsed.data.runId,
            runId: parsed.data.runId,
            sessionId,
            signal: executionSignal,
            userId,
          })

          for await (const _chunk of attemptStream) {
            // Provider output is persisted and published by the journal-backed output handle.
          }
          if (nextAttempt === undefined) return

          currentAttempt = nextAttempt
          if (activeRun !== undefined) {
            const transitioned = await runTransitionAction(options.database, userId, sessionId, activeRun.id, {
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
    }

    void execute().catch(() => undefined)
    return context.json(commandResponse.data)
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
    if (apiIfNoneMatchMatches(context.req.header("If-None-Match"), result.data.etag)) {
      options.metricsCollector?.increment("snapshot_response_total", 1, { status: "304" })
      return new Response(null, { headers, status: 304 })
    }
    const response = await completeJsonResponse(context, result.data, headers, options.metricsCollector)
    if (response.status === 200) options.metricsCollector?.increment("snapshot_response_total", 1, { status: "200" })
    return response
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
    const resolvedEtag = await sessionMutationEtagResolve(
      options.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      expectedEtag.data,
      options.journalCursorCodec,
    )
    if (!resolvedEtag.success) {
      if (resolvedEtag.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }
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
        expectedEtag: resolvedEtag.data,
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
    const resolvedEtag = await sessionMutationEtagResolve(
      options.database,
      userId,
      organizationId,
      context.req.param("sessionId"),
      expectedEtag.data,
      options.journalCursorCodec,
    )
    if (!resolvedEtag.success) {
      if (resolvedEtag.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }
    const idempotencyKey = idempotencyKeyParse(context)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined ? undefined : apiIdempotencyRequestHashCreate({ ifMatch: expectedEtag.data })
    const result = await sessionArchive(options.database, userId, context.req.param("sessionId"), {
      expectedEtag: resolvedEtag.data,
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
    const resolvedEtag = await sessionMutationEtagResolve(
      options.database,
      userId,
      organizationId,
      context.req.param("sessionId"),
      expectedEtag.data,
      options.journalCursorCodec,
    )
    if (!resolvedEtag.success) {
      if (resolvedEtag.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }
    const idempotencyKey = idempotencyKeyParse(context)
    if (idempotencyKey instanceof Response) return idempotencyKey
    const requestHash =
      idempotencyKey === undefined ? undefined : apiIdempotencyRequestHashCreate({ ifMatch: expectedEtag.data })
    const result = await sessionDelete(options.database, userId, context.req.param("sessionId"), {
      expectedEtag: resolvedEtag.data,
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
