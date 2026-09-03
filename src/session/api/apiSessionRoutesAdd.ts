import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
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
import { commandCatalogDiscover } from "../../commands/actions/commandCatalogDiscover.js"
import { commandExecutionOverridesValidate } from "../../commands/actions/commandExecutionOverridesValidate.js"
import { commandExpand } from "../../commands/actions/commandExpand.js"
import { commandInvocationParse } from "../../commands/actions/commandInvocationParse.js"
import { commandShellInterpolationResolve } from "../../commands/actions/commandShellInterpolationResolve.js"
import { commandSubtaskSelectionValidate } from "../../commands/actions/commandSubtaskSelectionValidate.js"
import { commandMessageMetadataSchema } from "../../commands/schema/commandMessageMetadataSchema.js"
import { sessionCompactionContextReconstruct } from "../../compaction/actions/sessionCompactionContextReconstruct.js"
import { sessionCompactionGenerate } from "../../compaction/actions/sessionCompactionGenerate.js"
import { compactionConfigurationDefaults } from "../../compaction/compactionConfigurationDefaults.js"
import type { CompactionMessage } from "../../compaction/compactionMessage.js"
import { compactionPolicyFromConfiguration } from "../../compaction/compactionPolicyFromConfiguration.js"
import type { ConfigurationStore } from "../../configuration/configurationStore.js"
import type { DatabaseClient } from "../../database/databaseClient.js"
import { agentInstructionsDiscover } from "../../instructions/actions/agentInstructionsDiscover.js"
import type { JournalCursorCodec } from "../../journal/actions/journalCursorCodecCreate.js"
import type { journalPostCommitPublishCreate } from "../../journal/actions/journalPostCommitPublishCreate.js"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import { projectRegistryProjectIdResolve } from "../../project/projectRegistryProjectIdResolve.js"
import { providerAgentCatalogExecutionResolve } from "../../providers/catalog/providerAgentCatalogExecutionResolve.js"
import type { CliProxyApiAdapter } from "../../providers/runtime/cliProxyApiAdapterCreate.js"
import { providerDelegationAdapterCreate } from "../../providers/runtime/providerDelegationAdapterCreate.js"
import { providerDelegationToolLoopCreate } from "../../providers/runtime/providerDelegationToolLoopCreate.js"
import { providerDeterministicScenarioResolve } from "../../providers/runtime/providerDeterministicScenarioResolve.js"
import { providerExecutionEventFromStreamChunk } from "../../providers/runtime/providerExecutionEventFromStreamChunk.js"
import type { ProviderInstructionContext } from "../../providers/runtime/providerInstructionContext.js"
import type { ProviderModelDiscoveryOptions } from "../../providers/runtime/providerModelDiscovery.js"
import { providerRuntimeAdapterCreate } from "../../providers/runtime/providerRuntimeAdapterCreate.js"
import { providerRuntimeAdapterResolve } from "../../providers/runtime/providerRuntimeAdapterResolve.js"
import type { CodelineExecution } from "../../providers/schema/codelineExecutionSchema.js"
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
import { runTerminalFinalize } from "../../run/actions/runTerminalFinalize.js"
import { runTransition } from "../../run/actions/runTransition.js"
import type { attemptTable } from "../../run/db/attemptTable.js"
import type { runTable } from "../../run/db/runTable.js"
import type { RunExecutionSnapshot } from "../../run/schema/runExecutionSnapshotSchema.js"
import { runExecutionSnapshotSchema } from "../../run/schema/runExecutionSnapshotSchema.js"
import type { serverShutdownCoordinatorCreate } from "../../server/serverShutdownCoordinatorCreate.js"
import { skillCatalogDiscover } from "../../skills/actions/skillCatalogDiscover.js"
import { skillPresetCatalogLoad } from "../../skills/actions/skillPresetCatalogLoad.js"
import type { SkillDescriptionCatalog } from "../../skills/schema/skillDescriptionCatalogSchema.js"
import type { SkillSnapshot } from "../../skills/schema/skillSnapshotSchema.js"
import { executionStreamEventNormalize } from "../../stream/actions/executionStreamEventNormalize.js"
import type { ExecutionStreamEvent } from "../../stream/schema/executionStreamEventSchema.js"
import { bashToolCreate } from "../../tools/runtime/bashToolCreate.js"
import { toolRegistryCreate } from "../../tools/runtime/toolRegistryCreate.js"
import type { ToolName } from "../../tools/schema/toolNameSchema.js"
import { sessionArchive } from "../actions/sessionArchive.js"
import { sessionBoundedHistoryPage } from "../actions/sessionBoundedHistoryPage.js"
import { sessionBoundedSnapshot } from "../actions/sessionBoundedSnapshot.js"
import type { sessionChatAdapterCreate } from "../actions/sessionChatAdapterCreate.js"
import { sessionChatCommandSubtaskAdapterCreate } from "../actions/sessionChatCommandSubtaskAdapterCreate.js"
import { sessionChatContextToolLifecycleResolve } from "../actions/sessionChatContextToolLifecycleResolve.js"
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
import { sessionShellSnapshot } from "../actions/sessionShellSnapshot.js"
import { sessionViewAcknowledge } from "../actions/sessionViewAcknowledge.js"
import { sessionJournalRecipientResolverCreate } from "../db/sessionJournalRecipientResolverCreate.js"
import { sessionListCursorCodecCreate } from "../db/sessionListCursorCodecCreate.js"
import { sessionBoundedHistoryQuerySchema } from "../schema/sessionBoundedHistoryQuerySchema.js"
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
import { sessionViewAcknowledgementResponseCreate } from "./sessionViewAcknowledgementResponseCreate.js"
import { sessionViewAcknowledgeRequestSchema } from "./sessionViewAcknowledgeRequestSchema.js"

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

function conflict(context: ApiContext, message: string, code = "conflict") {
  const response = { error: { code, message } } satisfies ApiErrorResponse
  return context.json(response, 409)
}

function internalServerError(context: ApiContext) {
  const response = {
    error: { code: "internal_server_error", message: "The request could not be completed." },
  } satisfies ApiErrorResponse
  return context.json(response, 500)
}

function sessionChatCompactionFailureMessageResolve(message: string): string {
  const resolved = message.trim()
  return (resolved.length === 0 ? "The compaction failed." : resolved).slice(0, 2_000)
}

function sessionChatCompactionFailureResolve(error: unknown): { code: string; message: string } {
  let code: unknown
  let message: unknown
  if (typeof error === "string") message = error
  if (error instanceof Error) message = error.message
  if (typeof error === "object" && error !== null) {
    if ("code" in error) code = error.code
    if ("errorMessage" in error) message = error.errorMessage
    else if ("message" in error) message = error.message
  }
  const resolvedCode = typeof code === "string" ? code.trim().slice(0, 100) : ""
  return {
    code: resolvedCode.length === 0 ? "compaction_failed" : resolvedCode,
    message: sessionChatCompactionFailureMessageResolve(typeof message === "string" ? message : ""),
  }
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
  agentInstructionsDiscover?: typeof agentInstructionsDiscover
  commandCatalogDiscover?: typeof commandCatalogDiscover
  database: DatabaseClient
  configurationStore?: ConfigurationStore
  providerAgentCatalog?: ProviderCatalog
  globalAgentsPath?: string
  globalCommandsPath?: string
  globalSkillsPath?: string
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
  sessionCompactionGenerate?: typeof sessionCompactionGenerate
  shutdownCoordinator?: ReturnType<typeof serverShutdownCoordinatorCreate>
  skillCatalogDiscover?: typeof skillCatalogDiscover
  skillPresetCatalogLoad?: typeof skillPresetCatalogLoad
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

function sessionInstructionProjectRootResolve(projectPath: string): string {
  return path.resolve(projectPath === "~" ? os.homedir() : projectPath)
}

function sessionInstructionContextCreate(
  projectPath: string,
  snapshot: ProviderInstructionContext["snapshot"],
): ProviderInstructionContext {
  return {
    projectRoot: sessionInstructionProjectRootResolve(projectPath),
    snapshot,
  }
}

function sessionChatContextLimitResolve(
  configuration: AgentConfiguration | undefined,
  modelContextLimitTokens?: number,
): number | undefined {
  if (configuration === undefined || configuration.provider === "deterministic") return undefined
  const contextLimitTokens = configuration.modelMetadata?.limit.context ?? modelContextLimitTokens
  return contextLimitTokens !== undefined && contextLimitTokens > 0 ? contextLimitTokens : undefined
}

function sessionChatCompactionPolicyCreate(
  configuration: NonNullable<AgentConfiguration["compaction"]>,
  contextLimitTokens: number | undefined,
) {
  const resolved = compactionPolicyFromConfiguration(configuration, contextLimitTokens)
  return resolved.success ? resolved.data : undefined
}

function sessionChatDelegationCompactionPolicyCreate(
  configuration: AgentConfiguration | undefined,
  contextLimitTokens: number | undefined,
) {
  if (configuration === undefined) return undefined
  const compaction = { ...compactionConfigurationDefaults, ...(configuration.compaction ?? {}) }
  if (!compaction.enabled || !compaction.auto) return undefined
  return sessionChatCompactionPolicyCreate(compaction, contextLimitTokens)
}

function sessionCreateRequestHashInputCreate(input: v.InferOutput<typeof sessionCreateRequestSchema>): unknown {
  return {
    command: input.command,
    metadata: input.metadata,
    executionSelection: input.executionSelection,
    skillSelection: input.skillSelection,
    primaryAgentId: input.primaryAgentId,
    projectId: input.projectId,
    ...(input.projectId === undefined ? { projectPath: input.projectPath } : {}),
    serverId: input.serverId,
    title: input.title,
    ...(input.agentPrompt === undefined ? {} : { agentPrompt: input.agentPrompt }),
    ...(input.instructionOverrides === undefined
      ? {}
      : {
          instructionOverrides: Object.fromEntries(
            Object.entries(input.instructionOverrides).sort(([left], [right]) => left.localeCompare(right)),
          ),
        }),
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

type SessionChatCommandSubtask = {
  agentId?: string
  execution?: CodelineExecution
  task: string
}

async function sessionChatAdmissionResolve(
  userId: string,
  sessionId: string,
  runId: string,
  target: { agentId: string; serverId: string },
  forwardedExecution: unknown,
  persistedExecutionSelection: unknown,
  persistedSkillSelection: unknown,
  persistedExecutionManifest: unknown,
  persistedInstructionSnapshot: unknown,
  persistedAgentPrompt: string | null,
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
      runtimeConfiguration: parsedSnapshot.output.configuration,
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
      ...(persistedExecutionManifest === null || persistedExecutionManifest === undefined
        ? {}
        : { executionManifest: persistedExecutionManifest }),
      agentInstructions: persistedInstructionSnapshot,
      ...(persistedAgentPrompt === null ? {} : { agentPrompt: persistedAgentPrompt }),
      skillSelection: persistedSkillSelection,
    },
  )
  if (!resolved.success) return createResultError(op, resolved.errorMessage)

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

function sessionCommandExecutionResolve(metadata: unknown, primaryAgentId: string): unknown {
  if (typeof metadata !== "object" || metadata === null || !("command" in metadata)) return undefined
  const parsed = v.safeParse(commandMessageMetadataSchema, { command: metadata.command })
  if (!parsed.success) return undefined
  const execution = parsed.output.command.execution
  if (parsed.output.command.overrides.subtask !== true || execution === undefined) return execution
  if (execution.agentId !== undefined && execution.agentId !== primaryAgentId) return undefined
  return execution
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
  const sessionCompactionGenerateAction = options.sessionCompactionGenerate ?? sessionCompactionGenerate
  const sessionListCursorCodec = sessionListCursorCodecCreate(options.journalCursorCodec)
  const runTerminalFinalizeAction = (
    userId: string,
    sessionId: string,
    runId: string,
    terminal: Parameters<typeof runTerminalFinalize>[1],
  ) =>
    runTerminalFinalize(
      {
        database: options.database,
        journalPostCommitPublish: options.journalPostCommitPublish,
        runId,
        sessionId,
        userId,
      },
      terminal,
      { runTransition: runTransitionAction },
    )

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
    const encodeGlobalSequence = options.journalCursorCodec.encodeGlobalSequence
    if (typeof encodeGlobalSequence !== "function" || !sessionListCursorCodec.success)
      return internalServerError(context)
    const result = await sessionListSnapshot(options.database, userId, organizationId, listOptions, {
      cursorCodec: { encodeGlobalSequence, sessionList: sessionListCursorCodec.data },
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
    // Home has no registry entry, but an explicit project path must never bypass
    // registry authorization. Internal action callers retain the path-based branch.
    if (parsed.data.projectId === undefined && parsed.data.projectPath !== undefined && parsed.data.projectPath !== "~")
      return badRequest(context, "A registered project is required to create a session.")

    const requestHash = apiIdempotencyRequestHashCreate(sessionCreateRequestHashInputCreate(parsed.data))
    const result = await sessionCreate(options.database, userId, parsed.data, {
      idempotencyKey: parsed.data.clientRequestId,
      journal: {
        postCommitPublish: options.journalPostCommitPublish,
        resolveRecipients: sessionJournalRecipientResolverCreate({
          organizationId,
          pendingSessionAuthorization: {
            ...(parsed.data.command === undefined ? { primaryAgentId: parsed.data.primaryAgentId } : {}),
            serverId: parsed.data.serverId,
            userId,
          },
        }),
      },
      organizationId,
      agentInstructionsDiscover: options.agentInstructionsDiscover,
      commandCatalogDiscover: options.commandCatalogDiscover,
      globalCommandsPath: options.globalCommandsPath,
      globalAgentsPath: options.globalAgentsPath,
      globalSkillsPath: options.globalSkillsPath,
      providerAgentCatalog: options.providerAgentCatalog,
      projectRootDirs: options.projectRootDirs,
      requestHash,
      signal: context.req.raw.signal,
      skillCatalogDiscover: options.skillCatalogDiscover,
      skillPresetCatalogLoad: options.skillPresetCatalogLoad,
    })
    if (!result.success) {
      if (result.code === "idempotency_conflict") return idempotencyConflict(context)
      // A command's shell interpolation fails with a structured tool code, so a
      // disabled or failing bash runtime is a bad request rather than a server fault.
      if (typeof result.code === "string" && result.code.startsWith("tool."))
        return badRequest(context, result.errorMessage)
      if (result.errorMessage.includes("execution selection"))
        return badRequest(context, "The session execution selection is invalid.")
      if (result.errorMessage.includes("instruction override")) return badRequest(context, result.errorMessage)
      if (result.errorMessage.includes("command") || result.errorMessage.includes("model override"))
        return badRequest(context, result.errorMessage)
      if (result.errorMessage.includes("project path"))
        return badRequest(context, "The session project path is invalid.")
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
        return notFound(context)
      return internalServerError(context)
    }

    context.header("Idempotency-Replayed", result.data.replayed ? "true" : "false")
    if (result.data.responseBody !== undefined)
      return context.json(result.data.responseBody, result.data.created && !result.data.replayed ? 201 : 200)
    const projectId = await projectRegistryProjectIdResolve(options.database, userId, result.data.session.projectPath)
    if (!projectId.success) return internalServerError(context)
    const response = sessionCreateMutationResponseCreate({
      created: result.data.created,
      projectId: projectId.data,
      session: result.data.session,
      userId,
    })
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
    const originalPrompt = finalMessage.content.trim()
    if (originalPrompt.length === 0)
      return badRequest(context, "The chat request must end with one plain-text user prompt.")

    let adapter = options.sessionChatAdapter
    let compactionAdapter: CliProxyApiAdapter | undefined
    let runtimeConfiguration: AgentConfiguration | undefined
    let runtimeModelContextLimitTokens: number | undefined
    let admittedRun: typeof runTable.$inferSelect | undefined
    let admittedAttempt: typeof attemptTable.$inferSelect | undefined
    let activeRun: typeof runTable.$inferSelect | undefined
    let activeAttempt: typeof attemptTable.$inferSelect | undefined
    let runtimeAgentPrompt: string | undefined
    let runtimeSkillDescriptionCatalog: SkillDescriptionCatalog | undefined
    let runtimeSkillSnapshots: readonly SkillSnapshot[] | undefined
    let runtimeToolNames: readonly ToolName[] = []
    let prompt = originalPrompt
    let commandMessageMetadata: unknown
    let commandForwardedExecution: unknown
    let commandSubtask: SessionChatCommandSubtask | undefined
    const loaded = await sessionLoad(options.database, userId, organizationId, sessionId)
    if (!loaded.success)
      return loaded.errorMessage.includes("could not be found") ? notFound(context) : internalServerError(context)
    if (loaded.data.session.archivedAt !== null) return conflict(context, "The session is archived.")
    const manualCompactionRequested = originalPrompt === "/compact"
    commandForwardedExecution = sessionCommandExecutionResolve(
      loaded.data.session.metadata,
      loaded.data.session.primaryAgentId,
    )
    let runtimeInstructionContext = sessionInstructionContextCreate(
      loaded.data.session.projectPath,
      loaded.data.session.instructionSnapshot,
    )
    runtimeSkillDescriptionCatalog = loaded.data.session.executionManifest?.skills.descriptionCatalog
    runtimeSkillSnapshots = loaded.data.session.executionManifest?.skills.snapshots
    runtimeToolNames = loaded.data.session.executionManifest?.tools.primary.tools ?? []

    if (!manualCompactionRequested) {
      let commandInvocation = parsed.data.command
      if (commandInvocation === undefined) {
        const parsedInvocation = commandInvocationParse(originalPrompt)
        if (!parsedInvocation.success) return badRequest(context, parsedInvocation.errorMessage)
        commandInvocation = parsedInvocation.data ?? undefined
      }
      if (commandInvocation !== undefined) {
        const catalog = await (options.commandCatalogDiscover ?? commandCatalogDiscover)({
          ...(options.globalCommandsPath === undefined ? {} : { globalCommandsPath: options.globalCommandsPath }),
          projectRoot: sessionInstructionProjectRootResolve(loaded.data.session.projectPath),
        })
        if (!catalog.success) return internalServerError(context)
        const persistedCatalogDigest = loaded.data.session.executionManifest?.commandCatalog.digest
        if (
          persistedCatalogDigest !== null &&
          persistedCatalogDigest !== undefined &&
          persistedCatalogDigest !== catalog.data.digest
        )
          return conflict(context, "The command catalog changed after this session was created.")
        const command = catalog.data.commands.find(({ name }) => name === commandInvocation?.name)
        if (command === undefined) return badRequest(context, "The requested command could not be found.")
        const expanded = commandExpand({
          arguments: commandInvocation.arguments,
          catalogDigest: catalog.data.digest,
          command,
        })
        if (!expanded.success) return badRequest(context, expanded.errorMessage)
        const isSubtask = expanded.data.overrides.subtask === true
        const commandAgentDiffers =
          expanded.data.overrides.agent !== undefined &&
          expanded.data.overrides.agent !== loaded.data.session.primaryAgentId
        const overrides = await commandExecutionOverridesValidate(
          options.database,
          {
            overrides: expanded.data.overrides,
            primaryAgentId: loaded.data.session.primaryAgentId,
            serverId: loaded.data.session.serverId,
          },
          {
            allowAgentOverride: isSubtask,
            catalog: options.providerAgentCatalog,
            ...(commandAgentDiffers ? {} : { configuration: loaded.data.agent.configuration }),
          },
        )
        if (!overrides.success) return badRequest(context, overrides.errorMessage)
        if (isSubtask) {
          const subtaskSelection = commandSubtaskSelectionValidate({
            primaryAgentId: loaded.data.session.primaryAgentId,
            selection: loaded.data.session.executionSelection,
            subtaskAgentId: overrides.data.agentId,
            ...(options.providerAgentCatalog === undefined ? {} : { catalog: options.providerAgentCatalog }),
          })
          if (!subtaskSelection.success) return badRequest(context, subtaskSelection.errorMessage)
          commandForwardedExecution =
            overrides.data.agentId === loaded.data.session.primaryAgentId ? overrides.data.execution : undefined
        } else {
          commandForwardedExecution = overrides.data.execution
        }

        const commandRegistry = toolRegistryCreate()
        const registered = commandRegistry.register({
          ...bashToolCreate({ projectRoot: sessionInstructionProjectRootResolve(loaded.data.session.projectPath) }),
          enabled: runtimeToolNames.includes("bash"),
        })
        if (!registered.success) return internalServerError(context)
        const shell = await commandShellInterpolationResolve(expanded.data.expandedText, {
          registry: commandRegistry,
          signal: context.req.raw.signal,
          workingDirectory: sessionInstructionProjectRootResolve(loaded.data.session.projectPath),
        })
        if (!shell.success) {
          if (shell.code === "tool.disabled") return badRequest(context, shell.errorMessage)
          if (shell.code === "tool.aborted" || shell.code === "tool.timeout")
            return conflict(context, shell.errorMessage)
          return badRequest(context, shell.errorMessage)
        }
        prompt = shell.data.trim()
        if (prompt.length === 0) return badRequest(context, "The expanded command is empty.")
        if (isSubtask) {
          commandSubtask = {
            ...(overrides.data.agentId === loaded.data.session.primaryAgentId
              ? {}
              : { agentId: overrides.data.agentId }),
            ...(overrides.data.execution === undefined ? {} : { execution: overrides.data.execution }),
            task: prompt,
          }
        }
        const metadata = v.safeParse(commandMessageMetadataSchema, {
          command: {
            argumentsText: expanded.data.argumentsText,
            catalogDigest: catalog.data.digest,
            ...(overrides.data.execution === undefined ? {} : { execution: overrides.data.execution }),
            expandedUserText: prompt,
            name: expanded.data.commandName,
            overrides: expanded.data.overrides,
            templateDigest: expanded.data.templateDigest,
            version: 1,
          },
        })
        if (!metadata.success) return internalServerError(context)
        commandMessageMetadata = metadata.output
      }
    }
    const lunaPing = sessionChatLunaPingDetect({
      primaryAgentId: loaded.data.session.primaryAgentId,
      prompt,
    })
    if (commandSubtask === undefined && lunaPing) adapter = sessionChatLunaPingAdapterCreate

    if (options.configurationStore !== undefined) {
      const admission = await sessionChatAdmissionResolve(
        userId,
        sessionId,
        parsed.data.runId,
        { agentId: loaded.data.session.primaryAgentId, serverId: loaded.data.session.serverId },
        commandForwardedExecution ?? parsed.data.forwardedProps?.codelineExecution,
        loaded.data.session.executionSelection,
        loaded.data.session.skillSelection,
        loaded.data.session.executionManifest,
        loaded.data.session.instructionSnapshot,
        loaded.data.session.agentPrompt,
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
      runtimeModelContextLimitTokens = admission.data.snapshot.modelMetadata?.limit.context
      runtimeAgentPrompt = admission.data.agentPrompt
      runtimeSkillDescriptionCatalog = admission.data.snapshot.executionManifest?.skills.descriptionCatalog
      runtimeSkillSnapshots = admission.data.snapshot.executionManifest?.skills.snapshots
      runtimeToolNames = admission.data.snapshot.executionManifest?.tools.primary.tools ?? []
      if (admission.data.snapshot.executionManifest?.instructions !== undefined)
        runtimeInstructionContext = sessionInstructionContextCreate(
          loaded.data.session.projectPath,
          admission.data.snapshot.executionManifest.instructions,
        )

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
          commandForwardedExecution ?? parsed.data.forwardedProps?.codelineExecution,
        )
        if (!resolved.success) return badRequest(context, resolved.errorMessage)
        runtimeConfiguration = resolved.data.configuration
        runtimeModelContextLimitTokens = resolved.data.modelMetadata.limit.context
        runtimeAgentPrompt = resolved.data.prompt
      } else {
        const resolvedConfiguration = agentConfigurationExecutionResolve(
          loaded.data.agent.configuration,
          commandForwardedExecution ?? parsed.data.forwardedProps?.codelineExecution,
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
    if (loaded.data.session.agentPrompt !== null) runtimeAgentPrompt = loaded.data.session.agentPrompt

    const delegatedTaskExecute = async (
      input: {
        agentId?: string
        execution?: unknown
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
            ...(input.execution === undefined ? {} : { execution: input.execution }),
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
              instructionContext: sessionInstructionContextCreate(
                loaded.data.session.projectPath,
                snapshot.output.executionManifest?.instructions ?? runtimeInstructionContext.snapshot,
              ),
              runtimeAdapterCreate: options.providerRuntimeAdapterCreate,
              systemPrompt: snapshot.output.agentPrompt,
            })
            if (!resolved.success) throw new Error(resolved.errorMessage)
            const compactionPolicy = sessionChatDelegationCompactionPolicyCreate(
              snapshot.output.configuration,
              snapshot.output.configuration.provider === "deterministic"
                ? undefined
                : snapshot.output.configuration.modelMetadata?.limit.context,
            )
            const adapter = providerDelegationAdapterCreate({
              adapter: resolved.data,
              bash: { projectRoot: sessionInstructionProjectRootResolve(loaded.data.session.projectPath) },
              ...(compactionPolicy === undefined ? {} : { compactionPolicy }),
              delegateTask: (input) => delegatedTaskExecute(input, { attempt, run }),
              enabledTools: snapshot.output.executionManifest?.tools.primary.tools ?? [],
              projectRoot: sessionInstructionProjectRootResolve(loaded.data.session.projectPath),
              instructionContext: sessionInstructionContextCreate(
                loaded.data.session.projectPath,
                snapshot.output.executionManifest?.instructions ?? runtimeInstructionContext.snapshot,
              ),
              model: snapshot.output.configuration.model,
              ...(snapshot.output.executionManifest?.skills.descriptionCatalog === undefined
                ? {}
                : { skillDescriptionCatalog: snapshot.output.executionManifest.skills.descriptionCatalog }),
              ...(snapshot.output.executionManifest?.skills.snapshots === undefined
                ? {}
                : { skillSnapshots: snapshot.output.executionManifest.skills.snapshots }),
              systemPrompt: snapshot.output.agentPrompt,
              toolLoopCreate: options.providerDelegationToolLoopCreate,
              webfetch: {},
            })
            return sessionChatChildExecutionStreamCreate({ adapter, run, signal, task })
          },
          cancellationRegister: (registration) =>
            (() => {
              const unregisterShutdown = options.shutdownCoordinator?.register(registration.controller)
              try {
                const unregisterExecution =
                  options.runActiveRegistry !== undefined
                    ? (() => {
                        const registered = options.runActiveRegistry.register(registration)
                        if (!registered.success) throw new Error(registered.errorMessage)
                        return registered.data.cleanup
                      })()
                    : (options.runCancellationCoordinator?.register(registration) ?? (() => undefined))
                return () => {
                  unregisterExecution()
                  unregisterShutdown?.()
                }
              } catch (error: unknown) {
                unregisterShutdown?.()
                throw error
              }
            })(),
          childCreate: (childInput) =>
            runChildCreateAction(options.database, userId, sessionId, childInput, {
              postCommitPublish: options.journalPostCommitPublish,
              resolveRecipients: sessionJournalRecipientResolverCreate({ organizationId }),
            }),
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

    if (commandSubtask !== undefined) {
      adapter = sessionChatCommandSubtaskAdapterCreate({
        ...(commandSubtask.agentId === undefined ? {} : { agentId: commandSubtask.agentId }),
        execute: delegatedTaskExecute,
        ...(commandSubtask.execution === undefined ? {} : { execution: commandSubtask.execution }),
      })
    }

    let prepared: Awaited<ReturnType<typeof sessionChatPrepare>> | undefined
    if (!manualCompactionRequested) {
      const nextPrepared = await sessionChatPrepare(options.database, userId, organizationId, sessionId, {
        clientRequestId: parsed.data.runId,
        content: prompt,
        ...(commandMessageMetadata === undefined ? {} : { metadata: commandMessageMetadata }),
      })
      if (!nextPrepared.success) {
        if (nextPrepared.errorMessage.includes("could not be found")) return notFound(context)
        if (nextPrepared.errorMessage.includes("already used") || nextPrepared.errorMessage.includes("archived"))
          return conflict(context, nextPrepared.errorMessage)
        return internalServerError(context)
      }
      prepared = nextPrepared
    }

    let executionClaimed = admittedRun === undefined
    const commandRunId = admittedRun?.id ?? parsed.data.runId
    const commandResponse = sessionChatCommandResponseCreate(commandRunId, sessionId)
    if (!commandResponse.success) return internalServerError(context)
    if (admittedRun !== undefined && admittedRun.status !== "accepted") return context.json(commandResponse.data)

    if (adapter === undefined) {
      if (runtimeConfiguration === undefined) return internalServerError(context)
      const resolved = providerRuntimeAdapterResolve(runtimeConfiguration, {
        environment: options.providerEnvironment ?? Bun.env,
        ...(options.providerFetch === undefined ? {} : { fetch: options.providerFetch }),
        instructionContext: runtimeInstructionContext,
        runtimeAdapterCreate: options.providerRuntimeAdapterCreate,
        ...(runtimeAgentPrompt === undefined ? {} : { systemPrompt: runtimeAgentPrompt }),
      })
      if (!resolved.success) return internalServerError(context)
      compactionAdapter = resolved.data
      const deterministicScenario =
        runtimeConfiguration.provider === "deterministic"
          ? providerDeterministicScenarioResolve(runtimeConfiguration.model)
          : null
      const delegationCompactionPolicy = sessionChatDelegationCompactionPolicyCreate(
        runtimeConfiguration,
        runtimeModelContextLimitTokens,
      )
      adapter =
        deterministicScenario === null ||
        ("delegation" in deterministicScenario && deterministicScenario.delegation !== undefined)
          ? providerDelegationAdapterCreate({
              adapter: resolved.data,
              bash: { projectRoot: sessionInstructionProjectRootResolve(loaded.data.session.projectPath) },
              ...(delegationCompactionPolicy === undefined ? {} : { compactionPolicy: delegationCompactionPolicy }),
              delegateTask: delegatedTaskExecute,
              enabledTools: runtimeToolNames,
              projectRoot: sessionInstructionProjectRootResolve(loaded.data.session.projectPath),
              instructionContext: runtimeInstructionContext,
              model: runtimeConfiguration.model,
              ...(runtimeSkillDescriptionCatalog === undefined
                ? {}
                : { skillDescriptionCatalog: runtimeSkillDescriptionCatalog }),
              ...(runtimeSkillSnapshots === undefined ? {} : { skillSnapshots: runtimeSkillSnapshots }),
              systemPrompt: runtimeAgentPrompt,
              toolLoopCreate: options.providerDelegationToolLoopCreate,
              webfetch: {},
            })
          : resolved.data
    }

    let executionSignal: AbortSignal
    let unregisterCancellation: (() => void) | undefined
    let unregisterShutdown: (() => void) | undefined
    const executionAbortController = new AbortController()
    unregisterShutdown = options.shutdownCoordinator?.register(executionAbortController)
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
            ...(manualCompactionRequested ? { runTransition: runTransitionAction } : {}),
          })
    let providerOutput = createdProviderOutput
    if (options.runActiveRegistry !== undefined) {
      const registered = options.runActiveRegistry.register({
        ...(createdProviderOutput === undefined ? {} : { providerOutput: createdProviderOutput }),
        controller: executionAbortController,
        runId: commandRunId,
        sessionId,
        userId,
      })
      if (!registered.success) {
        unregisterShutdown?.()
        return internalServerError(context)
      }
      providerOutput = registered.data.lifecycle.providerOutput
      executionSignal = registered.data.lifecycle.signal
      unregisterCancellation = registered.data.cleanup
    } else {
      executionSignal = executionAbortController.signal
      unregisterCancellation = options.runCancellationCoordinator?.register({
        controller: executionAbortController,
        runId: commandRunId,
        sessionId,
        userId,
      })
    }

    if (admittedRun !== undefined) {
      if (providerOutput === undefined) {
        unregisterCancellation?.()
        unregisterShutdown?.()
        return internalServerError(context)
      }
      const started = await providerOutput.start()
      if (!started.success) {
        unregisterCancellation?.()
        unregisterShutdown?.()
        return internalServerError(context)
      }
      admittedRun = started.data.run
      admittedAttempt = started.data.attempt
      activeRun = started.data.run
      activeAttempt = started.data.attempt
      executionClaimed = started.data.changed
    }
    if (admittedRun !== undefined && !executionClaimed) {
      unregisterCancellation?.()
      unregisterShutdown?.()
      return context.json(commandResponse.data)
    }

    if (manualCompactionRequested) {
      let manualCompactionTerminalStatus: "aborted" | "failed" | "succeeded" | undefined
      let manualCompactionFailurePromise: Promise<Result<void>> | undefined
      let manualCompactionAbortPromise: Promise<Result<void>> | undefined
      const manualCompactionRunFinalize = async (input: {
        failure?: { code: string; message: string }
        reason?: string
        status: "aborted" | "failed" | "succeeded"
      }): Promise<Result<void>> => {
        if (manualCompactionTerminalStatus !== undefined) return createResult(undefined)
        if (providerOutput !== undefined) {
          const finalized = await providerOutput.finalize(input)
          if (!finalized.success) return finalized
          activeRun = finalized.data.run
          activeAttempt = finalized.data.attempt
          manualCompactionTerminalStatus = input.status
          return createResult(undefined)
        }
        if (activeRun === undefined) return createResult(undefined)
        const transitioned = await runTerminalFinalizeAction(userId, sessionId, activeRun.id, input)
        if (!transitioned.success) return transitioned
        activeRun = transitioned.data.run
        activeAttempt = transitioned.data.attempt
        manualCompactionTerminalStatus = input.status
        return createResult(undefined)
      }

      const manualCompactionRunFinalizeAttempt = async (input: Parameters<typeof manualCompactionRunFinalize>[0]) => {
        try {
          return await manualCompactionRunFinalize(input)
        } catch (error: unknown) {
          const failure = sessionChatCompactionFailureResolve(error)
          return createResultErrorCode("manualCompactionRunFinalize", failure.message, failure.code)
        }
      }

      const manualCompactionRunDurableStateResolve = async (): Promise<Result<boolean>> => {
        if (manualCompactionTerminalStatus !== undefined) return createResult(true)
        try {
          const loadedRun = await runLoadAction(options.database, userId, sessionId, commandRunId)
          if (!loadedRun.success) return loadedRun
          activeRun = loadedRun.data.run
          activeAttempt = loadedRun.data.attempt
          if (
            loadedRun.data.run.status === "aborted" ||
            loadedRun.data.run.status === "failed" ||
            loadedRun.data.run.status === "succeeded"
          ) {
            manualCompactionTerminalStatus = loadedRun.data.run.status
            return createResult(true)
          }
          return createResult(false)
        } catch (error: unknown) {
          const failure = sessionChatCompactionFailureResolve(error)
          return createResultErrorCode("manualCompactionRunDurableStateResolve", failure.message, failure.code)
        }
      }

      const manualCompactionRunFailureFinalize = (failure: {
        code: string
        message: string
      }): Promise<Result<void>> => {
        if (manualCompactionFailurePromise !== undefined) return manualCompactionFailurePromise
        manualCompactionFailurePromise = (async () => {
          try {
            if (manualCompactionTerminalStatus !== undefined) return createResult(undefined)
            const current = await manualCompactionRunDurableStateResolve()
            if (current.success && current.data) return createResult(undefined)

            const finalized = await manualCompactionRunFinalizeAttempt({ failure, status: "failed" })
            if (finalized.success) return finalized
            const afterFinalization = await manualCompactionRunDurableStateResolve()
            if (afterFinalization.success && afterFinalization.data) return createResult(undefined)

            const retried = await manualCompactionRunFinalizeAttempt({ failure, status: "failed" })
            if (retried.success) return retried
            const afterRetry = await manualCompactionRunDurableStateResolve()
            if (afterRetry.success && afterRetry.data) return createResult(undefined)
            return retried
          } catch (error: unknown) {
            const resolved = sessionChatCompactionFailureResolve(error)
            return createResultErrorCode("manualCompactionRunFailureFinalize", resolved.message, resolved.code)
          }
        })()
        return manualCompactionFailurePromise
      }

      const manualCompactionRunAbortFinalize = (): Promise<Result<void>> => {
        if (manualCompactionAbortPromise !== undefined) return manualCompactionAbortPromise
        manualCompactionAbortPromise = (async () => {
          try {
            if (manualCompactionTerminalStatus !== undefined) return createResult(undefined)
            const current = await manualCompactionRunDurableStateResolve()
            if (current.success && current.data) return createResult(undefined)

            const finalized = await manualCompactionRunFinalizeAttempt({
              reason: "The chat run was aborted.",
              status: "aborted",
            })
            if (finalized.success) return finalized
            const afterFinalization = await manualCompactionRunDurableStateResolve()
            if (afterFinalization.success && afterFinalization.data) return createResult(undefined)

            const retried = await manualCompactionRunFinalizeAttempt({
              reason: "The chat run was aborted.",
              status: "aborted",
            })
            if (retried.success) return retried
            const afterRetry = await manualCompactionRunDurableStateResolve()
            if (afterRetry.success && afterRetry.data) return createResult(undefined)
            return retried
          } catch (error: unknown) {
            const failure = sessionChatCompactionFailureResolve(error)
            return createResultErrorCode("manualCompactionRunAbortFinalize", failure.message, failure.code)
          }
        })()
        return manualCompactionAbortPromise
      }

      const manualCompactionRunFailureFinalizeChecked = async (failure: {
        code: string
        message: string
      }): Promise<void> => {
        const finalized = await manualCompactionRunFailureFinalize(failure)
        if (!finalized.success) throw new Error(finalized.errorMessage)
      }

      const manualCompactionRunAbortFinalizeChecked = async (): Promise<void> => {
        const finalized = await manualCompactionRunAbortFinalize()
        if (!finalized.success) throw new Error(finalized.errorMessage)
      }

      const manualCompactionExecute = async (): Promise<void> => {
        try {
          if (executionSignal.aborted) {
            await manualCompactionRunAbortFinalizeChecked()
            return
          }

          const configuration = {
            ...compactionConfigurationDefaults,
            ...(runtimeConfiguration?.compaction ?? {}),
            auto: false,
          }
          const policy = sessionChatCompactionPolicyCreate(
            configuration,
            sessionChatContextLimitResolve(runtimeConfiguration, runtimeModelContextLimitTokens),
          )
          if (policy === undefined) {
            await manualCompactionRunFailureFinalizeChecked({
              code: "compaction_failed",
              message: "The compaction configuration is invalid.",
            })
            return
          }

          const generated = await sessionCompactionGenerateAction(options.database, userId, organizationId, sessionId, {
            ...(compactionAdapter === undefined ? {} : { adapter: compactionAdapter }),
            criticalContext: runtimeAgentPrompt,
            environment: options.providerEnvironment ?? Bun.env,
            ...(options.providerFetch === undefined ? {} : { fetch: options.providerFetch }),
            policy,
            runtimeConfiguration,
            ...(options.providerRuntimeAdapterCreate === undefined
              ? {}
              : { runtimeAdapterCreate: options.providerRuntimeAdapterCreate }),
            signal: executionSignal,
            sourceRevision: loaded.data.session.revision,
          })
          if (executionSignal.aborted) {
            await manualCompactionRunAbortFinalizeChecked()
            return
          }
          if (!generated.success) {
            await manualCompactionRunFailureFinalizeChecked(sessionChatCompactionFailureResolve(generated))
            return
          }
          const finalized = await manualCompactionRunFinalizeAttempt({ status: "succeeded" })
          if (finalized.success) return
          await manualCompactionRunFailureFinalizeChecked(sessionChatCompactionFailureResolve(finalized))
        } catch (error: unknown) {
          if (executionSignal.aborted) {
            await manualCompactionRunAbortFinalizeChecked()
            return
          }
          await manualCompactionRunFailureFinalizeChecked(sessionChatCompactionFailureResolve(error))
        } finally {
          unregisterCancellation?.()
          unregisterShutdown?.()
        }
      }

      void manualCompactionExecute().catch((error: unknown) => {
        const handling = executionSignal.aborted
          ? manualCompactionRunAbortFinalize()
          : manualCompactionRunFailureFinalize(sessionChatCompactionFailureResolve(error))
        void handling.then((result) => {
          if (result.success) return
          console.error("Manual compaction terminal handling failed.", result)
        })
      })
      return context.json(commandResponse.data)
    }

    if (prepared === undefined || !prepared.success) return internalServerError(context)

    let currentHistory = prepared.data.history
    let requestSourceRevision = prepared.data.sourceRevision
    let compactionAttempted = false
    let overflowRetryCount = 0
    const execute = async (): Promise<void> => {
      let currentAttempt = admittedAttempt

      try {
        while (true) {
          let nextAttempt: typeof attemptTable.$inferSelect | undefined
          let retryCurrentAttempt = false
          const attemptStream = sessionChatStreamCreate({
            adapter: adapter as NonNullable<typeof adapter>,
            attemptOrdinal: currentAttempt?.ordinal,
            compactionConfiguration: compactionAttempted
              ? { ...compactionConfigurationDefaults, auto: false }
              : (runtimeConfiguration?.compaction ?? compactionConfigurationDefaults),
            compactionAdapter,
            database: options.database,
            environment: options.providerEnvironment ?? Bun.env,
            ...(options.providerFetch === undefined ? {} : { fetch: options.providerFetch }),
            contextLimitTokens: sessionChatContextLimitResolve(runtimeConfiguration, runtimeModelContextLimitTokens),
            history: currentHistory,
            organizationId,
            onTerminal: async (terminal) => {
              if (activeRun === undefined || currentAttempt === undefined) return
              const providerFailureFinalize = async (): Promise<void> => {
                if (providerOutput === undefined) {
                  if (activeRun === undefined) return
                  const finalized = await runTerminalFinalizeAction(userId, sessionId, activeRun.id, {
                    failure: terminal.failure,
                    status: "failed",
                  })
                  if (!finalized.success) throw new Error(finalized.errorMessage)
                  activeRun = finalized.data.run
                  activeAttempt = finalized.data.attempt
                  return
                }
                if (terminal.failure === undefined) return
                const finalized = await providerOutput.finalize({
                  failure: terminal.failure,
                  messageId: terminal.messageId,
                  status: "failed",
                })
                if (!finalized.success) throw new Error(finalized.errorMessage)
                activeRun = finalized.data.run
                activeAttempt = finalized.data.attempt
              }
              const providerAbortFinalize = async (): Promise<void> => {
                if (providerOutput === undefined) {
                  if (activeRun === undefined) return
                  const transitioned = await runTerminalFinalizeAction(userId, sessionId, activeRun.id, {
                    status: "aborted",
                  })
                  if (!transitioned.success) throw new Error(transitioned.errorMessage)
                  activeRun = transitioned.data.run
                  activeAttempt = transitioned.data.attempt
                  return
                }
                const finalized = await providerOutput.finalize({
                  messageId: terminal.messageId,
                  reason: "The chat run was aborted.",
                  status: "aborted",
                })
                if (!finalized.success) throw new Error(finalized.errorMessage)
                activeRun = finalized.data.run
                activeAttempt = finalized.data.attempt
              }

              const sessionChatOverflowRecover = async (): Promise<boolean> => {
                const configuration = {
                  ...compactionConfigurationDefaults,
                  ...(runtimeConfiguration?.compaction ?? {}),
                }
                if (overflowRetryCount >= configuration.maxOverflowRetries || executionSignal.aborted) return false

                const contextLimitTokens = sessionChatContextLimitResolve(
                  runtimeConfiguration,
                  runtimeModelContextLimitTokens,
                )
                const policy = sessionChatCompactionPolicyCreate(configuration, contextLimitTokens)
                if (policy === undefined) return false
                const toolLifecycle = sessionChatContextToolLifecycleResolve(currentHistory, prepared.data.userMessage)
                if (!toolLifecycle.complete) return false
                const before = await sessionCompactionContextReconstruct(
                  options.database,
                  userId,
                  organizationId,
                  sessionId,
                )
                if (!before.success || executionSignal.aborted) return false

                const generated = await sessionCompactionGenerateAction(
                  options.database,
                  userId,
                  organizationId,
                  sessionId,
                  {
                    ...(compactionAdapter === undefined ? {} : { adapter: compactionAdapter }),
                    criticalContext: runtimeAgentPrompt,
                    environment: options.providerEnvironment ?? Bun.env,
                    ...(options.providerFetch === undefined ? {} : { fetch: options.providerFetch }),
                    policy,
                    runtimeConfiguration,
                    ...(options.providerRuntimeAdapterCreate === undefined
                      ? {}
                      : { runtimeAdapterCreate: options.providerRuntimeAdapterCreate }),
                    signal: executionSignal,
                    sourceRevision: requestSourceRevision,
                  },
                )
                if (!generated.success || executionSignal.aborted) return false

                const currentSession = await sessionLoad(options.database, userId, organizationId, sessionId)
                if (!currentSession.success || currentSession.data.session.revision !== generated.data.sessionRevision)
                  return false

                const after = await sessionCompactionContextReconstruct(
                  options.database,
                  userId,
                  organizationId,
                  sessionId,
                )
                if (!after.success || executionSignal.aborted) return false
                const latestSession = await sessionLoad(options.database, userId, organizationId, sessionId)
                if (!latestSession.success || latestSession.data.session.revision !== generated.data.sessionRevision)
                  return false
                const beforeCoveredSequence = before.data.compaction?.coveredSequence ?? 0
                const afterCoveredSequence = after.data.compaction?.coveredSequence ?? 0
                if (afterCoveredSequence <= beforeCoveredSequence) return false

                requestSourceRevision = generated.data.sessionRevision
                currentHistory = [...after.data.history, ...toolLifecycle.suffix]
                overflowRetryCount += 1
                return true
              }

              if (terminal.status === "failed" && terminal.failure?.code === "provider_context_overflow") {
                if (executionSignal.aborted) {
                  await providerAbortFinalize()
                  return
                }
                if (await sessionChatOverflowRecover()) {
                  retryCurrentAttempt = true
                  return
                }
                if (executionSignal.aborted) {
                  await providerAbortFinalize()
                  return
                }
                if (providerOutput !== undefined) {
                  await providerFailureFinalize()
                  return
                }
                if (activeRun === undefined) return
                const transitioned = await runTerminalFinalizeAction(userId, sessionId, activeRun.id, {
                  failure: terminal.failure,
                  status: "failed",
                })
                if (!transitioned.success) throw new Error(transitioned.errorMessage)
                activeRun = transitioned.data.run
                activeAttempt = transitioned.data.attempt
                return
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
                  ...(terminal.usage === undefined ? {} : { usage: terminal.usage }),
                  status: terminal.status,
                })
                if (!finalized.success) throw new Error(finalized.errorMessage)
                activeRun = finalized.data.run
                activeAttempt = finalized.data.attempt
                return
              }
              if (providerOutput !== undefined && terminal.status === "aborted") {
                await providerAbortFinalize()
                return
              }
              if (
                providerOutput === undefined &&
                (terminal.status !== "failed" ||
                  terminal.failure === undefined ||
                  runFailureClassResolve(terminal.failure) !== "retryable")
              ) {
                if (terminal.status === "failed") await providerFailureFinalize()
                else if (terminal.status === "aborted") await providerAbortFinalize()
                else {
                  const finalized = await runTerminalFinalizeAction(userId, sessionId, activeRun.id, {
                    messageId: terminal.messageId,
                    status: "succeeded",
                  })
                  if (!finalized.success) throw new Error(finalized.errorMessage)
                  activeRun = finalized.data.run
                  activeAttempt = finalized.data.attempt
                }
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

              const retry = await runRetryAttemptCreateAction(options.database, userId, sessionId, activeRun.id, {
                executionEvidence: terminal.executionEvidence,
              })
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
            preparedUserMessage: prepared.data.userMessage,
            requestId: parsed.data.runId,
            runId: parsed.data.runId,
            sessionId,
            signal: executionSignal,
            systemPrompt: runtimeAgentPrompt,
            tools: runtimeToolNames,
            runtimeConfiguration,
            runtimeAdapterCreate: options.providerRuntimeAdapterCreate,
            sourceRevision: requestSourceRevision,
            userId,
            onContextPrepared: (history: Array<CompactionMessage>, sourceRevision?: number) => {
              currentHistory = history
              requestSourceRevision = sourceRevision ?? requestSourceRevision
            },
          })
          compactionAttempted = true

          for await (const _chunk of attemptStream) {
            // Provider output is persisted and published by the journal-backed output handle.
          }
          if (retryCurrentAttempt) continue
          if (nextAttempt === undefined) return

          currentAttempt = nextAttempt
          if (activeRun !== undefined) {
            if (providerOutput === undefined) {
              const transitioned = await runTransitionAction(options.database, userId, sessionId, activeRun.id, {
                status: "running",
              })
              if (!transitioned.success) throw new Error(transitioned.errorMessage)
              activeRun = transitioned.data.run
              activeAttempt = transitioned.data.attempt
            } else {
              const started = await providerOutput.start()
              if (!started.success) throw new Error(started.errorMessage)
              activeRun = started.data.run
              activeAttempt = started.data.attempt
            }
          }
        }
      } finally {
        unregisterCancellation?.()
        unregisterShutdown?.()
      }
    }

    void execute().catch(() => undefined)
    return context.json(commandResponse.data)
  })

  api.get("/sessions/:sessionId/bounded-snapshot", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const result = await sessionBoundedSnapshot(
      options.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      { cursorCodec: options.journalCursorCodec },
    )
    if (!result.success) {
      if (result.code === "session_not_found" || result.errorMessage.includes("could not be found"))
        return notFound(context)
      return internalServerError(context)
    }

    const headers = new Headers({
      "Cache-Control": "private, no-cache",
      Vary: "Cookie, Accept-Encoding",
    })
    return completeJsonResponse(context, result.data, headers, options.metricsCollector)
  })

  api.get("/sessions/:sessionId/bounded-history", async (context) => {
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)
    const parsed = apiRequestParse(
      "sessionBoundedHistoryQueryParse",
      sessionBoundedHistoryQuerySchema,
      context.req.query(),
    )
    if (!parsed.success) return badRequest(context, "The bounded session history query is invalid.")

    const result = await sessionBoundedHistoryPage(
      options.database,
      context.var.requestIdentity.userId,
      organizationId,
      context.req.param("sessionId"),
      parsed.data,
      { cursorCodec: options.journalCursorCodec },
    )
    if (!result.success) {
      if (result.errorMessage.includes("cursor"))
        return badRequest(context, "The bounded session history cursor is invalid.")
      if (result.errorMessage.includes("could not be found")) return notFound(context)
      return internalServerError(context)
    }

    const headers = new Headers({
      "Cache-Control": "private, no-cache",
      Vary: "Cookie, Accept-Encoding",
    })
    return completeJsonResponse(context, result.data, headers, options.metricsCollector)
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

  api.post("/sessions/:sessionId/view", async (context) => {
    const userId = context.var.requestIdentity.userId
    const organizationId = context.var.requestIdentity.organizationId
    if (organizationId === undefined) return notFound(context)

    const rawBody = await context.req.text().catch(() => undefined)
    if (rawBody === undefined) return badRequest(context, "The session view request is invalid.")
    let body: unknown = {}
    if (rawBody.trim().length > 0) {
      try {
        body = JSON.parse(rawBody) as unknown
      } catch (_error) {
        return badRequest(context, "The session view request is invalid.")
      }
    }
    const parsed = apiRequestParse("sessionViewAcknowledgeRequestParse", sessionViewAcknowledgeRequestSchema, body)
    if (!parsed.success) return badRequest(context, "The session view request is invalid.")

    const result = await sessionViewAcknowledge(
      options.database,
      userId,
      organizationId,
      context.req.param("sessionId"),
      {
        journal: {
          postCommitPublish: options.journalPostCommitPublish,
          resolveRecipients: sessionJournalRecipientResolverCreate({ organizationId }),
        },
      },
    )
    if (!result.success) {
      if (result.errorMessage.includes("could not be found") || result.errorMessage.includes("could not be authorized"))
        return notFound(context)
      return internalServerError(context)
    }
    const response = sessionViewAcknowledgementResponseCreate({
      acknowledgedFinishedAt: result.data.acknowledgedFinishedAt,
      sessionId: context.req.param("sessionId"),
    })
    if (!response.success) return internalServerError(context)
    return context.json(response.data)
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
