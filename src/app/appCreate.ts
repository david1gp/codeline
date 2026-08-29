import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { apiRoutesAdd } from "../api/apiRoutesAdd.js"
import type { App, AppEnvironment } from "../api/appEnvironment.js"
import type { apiClientLogJournalWrite } from "../api/diagnostics/apiClientLogJournalWrite.js"
import type { ApiErrorResponse } from "../api/errors/apiErrorResponseSchema.js"
import type { HealthResponse } from "../api/health/healthResponseSchema.js"
import { commandCatalogDiscover } from "../commands/actions/commandCatalogDiscover.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import { databaseReadyCheck } from "../database/databaseReadyCheck.js"
import { identitySessionCreate } from "../identity/actions/identitySessionCreate.js"
import { identitySessionLoad } from "../identity/actions/identitySessionLoad.js"
import { identitySessionRevoke } from "../identity/actions/identitySessionRevoke.js"
import { oidcIdentityUpsert } from "../identity/actions/oidcIdentityUpsert.js"
import { organizationMemberLoad } from "../identity/actions/organizationMemberLoad.js"
import { authenticationMiddleware } from "../identity/api/authenticationMiddleware.js"
import { developmentIdentityUpsert } from "../identity/db/developmentIdentityUpsert.js"
import { oidcLoginTransactionConsume } from "../identity/db/oidcLoginTransactionConsume.js"
import { oidcLoginTransactionCreate } from "../identity/db/oidcLoginTransactionCreate.js"
import { oidcProviderDiscoveryCreate } from "../identity/oidc/oidcProviderDiscoveryCreate.js"
import type { OidcProviderFetch } from "../identity/oidc/oidcProviderFetch.js"
import { agentInstructionsDiscover } from "../instructions/actions/agentInstructionsDiscover.js"
import type { journalBacklogRead } from "../journal/actions/journalBacklogRead.js"
import type { JournalCursorCodec } from "../journal/actions/journalCursorCodecCreate.js"
import type { journalPostCommitPublishCreate } from "../journal/actions/journalPostCommitPublishCreate.js"
import type { metricsCollectorCreate } from "../metrics/metricsCollectorCreate.js"
import type { ProjectLimits } from "../project/projectLimitsSchema.js"
import { providerDelegationToolLoopCreate } from "../providers/runtime/providerDelegationToolLoopCreate.js"
import type { ProviderModelDiscoveryOptions } from "../providers/runtime/providerModelDiscovery.js"
import { providerRuntimeAdapterCreate } from "../providers/runtime/providerRuntimeAdapterCreate.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { runActiveRegistryCreate } from "../run/actions/runActiveRegistryCreate.js"
import { runCancel } from "../run/actions/runCancel.js"
import { runCancellationCoordinatorCreate } from "../run/actions/runCancellationCoordinatorCreate.js"
import { runChildCreate } from "../run/actions/runChildCreate.js"
import { runCreate } from "../run/actions/runCreate.js"
import { runDelegationExecute } from "../run/actions/runDelegationExecute.js"
import { runDelegationFinalize } from "../run/actions/runDelegationFinalize.js"
import { runExecutionSnapshotResolve } from "../run/actions/runExecutionSnapshotResolve.js"
import { runLoad } from "../run/actions/runLoad.js"
import { runRetryAttemptCreate } from "../run/actions/runRetryAttemptCreate.js"
import { runTransition } from "../run/actions/runTransition.js"
import type { serverShutdownCoordinatorCreate } from "../server/serverShutdownCoordinatorCreate.js"
import { sessionChatAdapterCreate } from "../session/actions/sessionChatAdapterCreate.js"
import { skillCatalogDiscover } from "../skills/actions/skillCatalogDiscover.js"
import { skillPresetCatalogLoad } from "../skills/actions/skillPresetCatalogLoad.js"
import type { streamLiveSubscriptionCreate } from "../stream/actions/streamLiveSubscriptionCreate.js"
import type { streamSseConnectionWriterCreate } from "../stream/actions/streamSseConnectionWriterCreate.js"
import { appKnownRouteResolve } from "./appKnownRouteResolve.js"
import { appUiShellFallbackAdd } from "./appUiShellFallbackAdd.js"

export type AppCreateOptions = {
  agentInstructionsDiscover?: typeof agentInstructionsDiscover
  commandCatalogDiscover?: typeof commandCatalogDiscover
  configuration?: RuntimeConfiguration
  configurationStore?: ConfigurationStore
  database?: DatabaseClient
  databaseReadyCheck?: typeof databaseReadyCheck
  developmentIdentityUpsert?: typeof developmentIdentityUpsert
  identitySessionLoad?: typeof identitySessionLoad
  identitySessionRevoke?: typeof identitySessionRevoke
  identitySessionCreate?: typeof identitySessionCreate
  oidcIdentityUpsert?: typeof oidcIdentityUpsert
  organizationMemberLoad?: typeof organizationMemberLoad
  oidcIdCreate?: () => string
  oidcLoginTransactionCreate?: typeof oidcLoginTransactionCreate
  oidcLoginTransactionConsume?: typeof oidcLoginTransactionConsume
  oidcNow?: () => Date
  oidcProviderDiscovery?: ReturnType<typeof oidcProviderDiscoveryCreate>
  oidcProviderFetch?: OidcProviderFetch
  oidcRandomValueCreate?: () => string
  oidcSessionCredentialCreate?: () => string
  oidcSessionIdCreate?: () => string
  oidcReturnToPathIsKnown?: typeof appKnownRouteResolve
  openCodeDatabasePath?: string
  projectLimits?: ProjectLimits
  projectRootDirs?: readonly string[]
  globalAgentsPath?: string
  globalCommandsPath?: string
  globalSkillsPath?: string
  skillCatalogDiscover?: typeof skillCatalogDiscover
  skillPresetCatalogLoad?: typeof skillPresetCatalogLoad
  providerConfiguration?: unknown
  providerAgentCatalog?: ProviderCatalog
  providerEnvironment?: Readonly<Record<string, string | undefined>>
  providerDelegationToolLoopCreate?: typeof providerDelegationToolLoopCreate
  providerFetch?: NonNullable<ProviderModelDiscoveryOptions["fetch"]>
  providerRuntimeAdapterCreate?: typeof providerRuntimeAdapterCreate
  runCreate?: typeof runCreate
  runActiveRegistry?: ReturnType<typeof runActiveRegistryCreate>
  runCancel?: typeof runCancel
  runCancellationCoordinator?: ReturnType<typeof runCancellationCoordinatorCreate>
  runChildCreate?: typeof runChildCreate
  runDelegationExecute?: typeof runDelegationExecute
  runDelegationFinalize?: typeof runDelegationFinalize
  runExecutionSnapshotResolve?: typeof runExecutionSnapshotResolve
  runLoad?: typeof runLoad
  runRetryAttemptCreate?: typeof runRetryAttemptCreate
  runTransition?: typeof runTransition
  shutdownCoordinator?: ReturnType<typeof serverShutdownCoordinatorCreate>
  sessionChatAdapter?: typeof sessionChatAdapterCreate
  journalCursorCodec?: JournalCursorCodec
  journalBacklogRead?: typeof journalBacklogRead
  journalPostCommitPublish?: ReturnType<typeof journalPostCommitPublishCreate>
  streamLiveSubscription?: ReturnType<typeof streamLiveSubscriptionCreate>
  streamSseConnectionWriterCreate?: typeof streamSseConnectionWriterCreate
  streamSseNow?: () => number
  streamSseScheduler?: Parameters<typeof streamSseConnectionWriterCreate>[0]["scheduler"]
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
  clientLogJournalWrite?: typeof apiClientLogJournalWrite
  uiShellPath?: string
}

export function appCreate(options: AppCreateOptions = {}): App {
  const app = new Hono<AppEnvironment>()
  const runActiveRegistry = options.runActiveRegistry ?? runActiveRegistryCreate()
  const shutdownCoordinator = options.shutdownCoordinator

  if (shutdownCoordinator !== undefined) {
    app.use("*", async (context, next) => {
      if (!shutdownCoordinator.admit()) {
        const response = {
          error: {
            code: "service_unavailable",
            message: "The service is shutting down.",
          },
        } satisfies ApiErrorResponse
        return context.json(response, 503)
      }

      return next()
    })
  }

  app.get("/health", (context) => {
    const response = {
      service: "codeline",
      status: "ok",
    } satisfies HealthResponse

    return context.json(response)
  })

  const readyCheck = async () =>
    options.database === undefined
      ? { success: false as const, op: "databaseReadyCheck", errorMessage: "The database is not ready." }
      : await (options.databaseReadyCheck ?? databaseReadyCheck)(options.database)

  app.get("/ready", async (context) => {
    const ready = await readyCheck()
    if (!ready.success) {
      const response = {
        error: {
          code: "database_not_ready",
          message: "The database is not ready.",
        },
      } satisfies ApiErrorResponse
      return context.json(response, 503)
    }

    return context.json({ database: "ready", service: "codeline", status: "ready" })
  })

  if (options.configuration !== undefined && options.database !== undefined) {
    app.use(
      "/api/*",
      authenticationMiddleware(options.configuration, options.database, {
        developmentIdentityUpsert: options.developmentIdentityUpsert,
        organizationMemberLoad: options.organizationMemberLoad,
        identitySessionLoad: options.identitySessionLoad,
      }),
    )
  }

  app.use("/api/*", async (context, next) => {
    context.set("streamLiveSubscription", options.streamLiveSubscription)
    await next()
  })

  apiRoutesAdd(app, readyCheck, {
    configuration: options.configuration,
    database: options.database,
    projectLimits: options.projectLimits,
    projectRootDirs: options.projectRootDirs,
    agentInstructionsDiscover: options.agentInstructionsDiscover,
    commandCatalogDiscover: options.commandCatalogDiscover,
    globalAgentsPath: options.globalAgentsPath,
    globalCommandsPath: options.globalCommandsPath,
    globalSkillsPath: options.globalSkillsPath,
    skillCatalogDiscover: options.skillCatalogDiscover,
    skillPresetCatalogLoad: options.skillPresetCatalogLoad,
    providerConfiguration: options.providerConfiguration,
    providerAgentCatalog: options.providerAgentCatalog,
    providerEnvironment: options.providerEnvironment,
    providerFetch: options.providerFetch,
    providerRuntimeAdapterCreate: options.providerRuntimeAdapterCreate,
    providerDelegationToolLoopCreate: options.providerDelegationToolLoopCreate,
    configurationStore: options.configurationStore,
    runCreate: options.runCreate,
    runActiveRegistry,
    runCancel: options.runCancel,
    runCancellationCoordinator: options.runCancellationCoordinator,
    runChildCreate: options.runChildCreate,
    runExecutionSnapshotResolve: options.runExecutionSnapshotResolve,
    runLoad: options.runLoad,
    runRetryAttemptCreate: options.runRetryAttemptCreate,
    runTransition: options.runTransition,
    shutdownCoordinator,
    identitySessionRevoke: options.identitySessionRevoke,
    identitySessionCreate: options.identitySessionCreate,
    identitySessionLoad: options.identitySessionLoad,
    oidcIdentityUpsert: options.oidcIdentityUpsert,
    oidcIdCreate: options.oidcIdCreate,
    oidcLoginTransactionCreate: options.oidcLoginTransactionCreate,
    oidcLoginTransactionConsume: options.oidcLoginTransactionConsume,
    oidcNow: options.oidcNow,
    oidcProviderDiscovery: options.oidcProviderDiscovery,
    oidcProviderFetch: options.oidcProviderFetch,
    oidcRandomValueCreate: options.oidcRandomValueCreate,
    oidcSessionCredentialCreate: options.oidcSessionCredentialCreate,
    oidcSessionIdCreate: options.oidcSessionIdCreate,
    oidcReturnToPathIsKnown: options.oidcReturnToPathIsKnown,
    authCallbackRoute: app,
    runDelegationExecute: options.runDelegationExecute,
    runDelegationFinalize: options.runDelegationFinalize,
    sessionChatAdapter: options.sessionChatAdapter,
    journalCursorCodec: options.journalCursorCodec,
    journalBacklogRead: options.journalBacklogRead,
    journalPostCommitPublish: options.journalPostCommitPublish,
    streamLiveSubscription: options.streamLiveSubscription,
    streamSseConnectionWriterCreate: options.streamSseConnectionWriterCreate,
    streamSseNow: options.streamSseNow,
    streamSseScheduler: options.streamSseScheduler,
    metricsCollector: options.metricsCollector,
    clientLogJournalWrite: options.clientLogJournalWrite,
    openCodeDatabasePath: options.openCodeDatabasePath,
  })

  const uiShellPath = options.uiShellPath ?? "./dist/ui/index.html"
  const serveUiShell = serveStatic({ path: uiShellPath })
  const serveServiceWorker = serveStatic({ root: "./dist/ui" })
  app.get("/", async (context, next) => {
    const response = await serveUiShell(context, next)
    if (response !== undefined) response.headers.set("Cache-Control", "no-store")
    return response
  })
  app.get("/assets/*", serveStatic({ root: "./dist/ui" }))
  app.get("/icons/*", serveStatic({ root: "./dist/ui" }))
  app.get("/favicon.ico", serveStatic({ root: "./dist/ui" }))
  app.get("/manifest.webmanifest", serveStatic({ root: "./dist/ui" }))
  app.get("/service-worker.js", async (context, next) => {
    const response = await serveServiceWorker(context, next)
    if (response !== undefined) response.headers.set("Cache-Control", "no-store")
    return response
  })
  appUiShellFallbackAdd(app, uiShellPath)

  app.notFound((context) => {
    const response = {
      error: {
        code: "not_found",
        message: "The requested route does not exist.",
      },
    } satisfies ApiErrorResponse

    return context.json(response, 404)
  })

  app.onError((_error, context) => {
    const response = {
      error: {
        code: "internal_server_error",
        message: "An unexpected server error occurred.",
      },
    } satisfies ApiErrorResponse

    return context.json(response, 500)
  })

  return app
}
