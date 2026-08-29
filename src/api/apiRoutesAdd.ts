import type { Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import { apiAgentRoutesAdd } from "../agents/api/apiAgentRoutesAdd.js"
import { appKnownRouteResolve } from "../app/appKnownRouteResolve.js"
import { commandCatalogDiscover } from "../commands/actions/commandCatalogDiscover.js"
import { apiCommandRoutesAdd } from "../commands/api/apiCommandRoutesAdd.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import { apiEventsRoutesAdd } from "../events/api/apiEventsRoutesAdd.js"
import { identitySessionRevoke } from "../identity/actions/identitySessionRevoke.js"
import { apiAuthRoutesAdd } from "../identity/api/apiAuthRoutesAdd.js"
import { oidcLoginTransactionCreate } from "../identity/db/oidcLoginTransactionCreate.js"
import { oidcProviderDiscoveryCreate } from "../identity/oidc/oidcProviderDiscoveryCreate.js"
import type { OidcProviderFetch } from "../identity/oidc/oidcProviderFetch.js"
import { agentInstructionsDiscover } from "../instructions/actions/agentInstructionsDiscover.js"
import { apiAgentInstructionRoutesAdd } from "../instructions/api/apiAgentInstructionRoutesAdd.js"
import type { journalBacklogRead } from "../journal/actions/journalBacklogRead.js"
import type { JournalCursorCodec } from "../journal/actions/journalCursorCodecCreate.js"
import type { journalPostCommitPublishCreate } from "../journal/actions/journalPostCommitPublishCreate.js"
import { apiMessageRoutesAdd } from "../message/api/apiMessageRoutesAdd.js"
import type { metricsCollectorCreate } from "../metrics/metricsCollectorCreate.js"
import { apiNoteRoutesAdd } from "../note/api/apiNoteRoutesAdd.js"
import { apiProjectRoutesAdd } from "../project/api/apiProjectRoutesAdd.js"
import type { ProjectLimits } from "../project/projectLimitsSchema.js"
import { apiProviderRoutesAdd } from "../providers/api/apiProviderRoutesAdd.js"
import { providerDelegationToolLoopCreate } from "../providers/runtime/providerDelegationToolLoopCreate.js"
import type { ProviderModelDiscoveryOptions } from "../providers/runtime/providerModelDiscovery.js"
import { providerRuntimeAdapterCreate } from "../providers/runtime/providerRuntimeAdapterCreate.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { runActiveListLoad } from "../run/actions/runActiveListLoad.js"
import { runActiveRegistryCreate } from "../run/actions/runActiveRegistryCreate.js"
import { runActiveSnapshotLoad } from "../run/actions/runActiveSnapshotLoad.js"
import { runCancel } from "../run/actions/runCancel.js"
import { runCancellationCoordinatorCreate } from "../run/actions/runCancellationCoordinatorCreate.js"
import { runChildCreate } from "../run/actions/runChildCreate.js"
import { runCreate } from "../run/actions/runCreate.js"
import { runDelegationExecute } from "../run/actions/runDelegationExecute.js"
import { runDelegationFinalize } from "../run/actions/runDelegationFinalize.js"
import { runExecutionSnapshotResolve } from "../run/actions/runExecutionSnapshotResolve.js"
import { runLoad } from "../run/actions/runLoad.js"
import { runRetryAttemptCreate } from "../run/actions/runRetryAttemptCreate.js"
import { runSessionSnapshotLoad } from "../run/actions/runSessionSnapshotLoad.js"
import { runTransition } from "../run/actions/runTransition.js"
import { sessionCompactionGenerate } from "../compaction/actions/sessionCompactionGenerate.js"
import { apiRunRoutesAdd } from "../run/api/apiRunRoutesAdd.js"
import { runErrorCatalog } from "../run/errors/runErrorCatalog.js"
import type { serverShutdownCoordinatorCreate } from "../server/serverShutdownCoordinatorCreate.js"
import { apiServerRoutesAdd } from "../servers/api/apiServerRoutesAdd.js"
import { sessionChatAdapterCreate } from "../session/actions/sessionChatAdapterCreate.js"
import { apiSessionBranchRoutesAdd } from "../session/api/apiSessionBranchRoutesAdd.js"
import { apiSessionExecutionSelectionDefaultRoutesAdd } from "../session/api/apiSessionExecutionSelectionDefaultRoutesAdd.js"
import { apiSessionRenameRoutesAdd } from "../session/api/apiSessionRenameRoutesAdd.js"
import { apiSessionRoutesAdd } from "../session/api/apiSessionRoutesAdd.js"
import { skillCatalogDiscover } from "../skills/actions/skillCatalogDiscover.js"
import { skillPresetCatalogLoad } from "../skills/actions/skillPresetCatalogLoad.js"
import { apiSkillRoutesAdd } from "../skills/api/apiSkillRoutesAdd.js"
import type { streamLiveSubscriptionCreate } from "../stream/actions/streamLiveSubscriptionCreate.js"
import type { streamSseConnectionWriterCreate } from "../stream/actions/streamSseConnectionWriterCreate.js"
import type { AppEnvironment } from "./appEnvironment.js"
import type { apiClientLogJournalWrite } from "./diagnostics/apiClientLogJournalWrite.js"
import { apiDiagnosticsRoutesAdd } from "./diagnostics/apiDiagnosticsRoutesAdd.js"
import { apiMetricsRoutesAdd } from "./diagnostics/apiMetricsRoutesAdd.js"
import { apiErrorCatalogCreate } from "./errors/apiErrorCatalogCreate.js"
import type { HealthResponse } from "./health/healthResponseSchema.js"
import { apiReadinessRoutesAdd } from "./readiness/apiReadinessRoutesAdd.js"
import { apiTestingRoutesAdd } from "./testing/apiTestingRoutesAdd.js"

type ApiRoutesAddOptions = {
  agentInstructionsDiscover?: typeof agentInstructionsDiscover
  commandCatalogDiscover?: typeof commandCatalogDiscover
  configuration?: RuntimeConfiguration
  configurationStore?: ConfigurationStore
  database?: DatabaseClient
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
  runActiveListLoad?: typeof runActiveListLoad
  runActiveRegistry?: ReturnType<typeof runActiveRegistryCreate>
  runActiveSnapshotLoad?: typeof runActiveSnapshotLoad
  runCreate?: typeof runCreate
  runCancel?: typeof runCancel
  runCancellationCoordinator?: ReturnType<typeof runCancellationCoordinatorCreate>
  runChildCreate?: typeof runChildCreate
  runDelegationExecute?: typeof runDelegationExecute
  runDelegationFinalize?: typeof runDelegationFinalize
  runExecutionSnapshotResolve?: typeof runExecutionSnapshotResolve
  runLoad?: typeof runLoad
  runRetryAttemptCreate?: typeof runRetryAttemptCreate
  runSessionSnapshotLoad?: typeof runSessionSnapshotLoad
  runTransition?: typeof runTransition
  sessionCompactionGenerate?: typeof sessionCompactionGenerate
  shutdownCoordinator?: ReturnType<typeof serverShutdownCoordinatorCreate>
  identitySessionRevoke?: typeof identitySessionRevoke
  identitySessionCreate?: typeof import("../identity/actions/identitySessionCreate.js").identitySessionCreate
  identitySessionLoad?: typeof import("../identity/actions/identitySessionLoad.js").identitySessionLoad
  oidcIdentityUpsert?: typeof import("../identity/actions/oidcIdentityUpsert.js").oidcIdentityUpsert
  oidcLoginTransactionCreate?: typeof oidcLoginTransactionCreate
  oidcLoginTransactionConsume?: typeof import("../identity/db/oidcLoginTransactionConsume.js").oidcLoginTransactionConsume
  oidcProviderDiscovery?: ReturnType<typeof oidcProviderDiscoveryCreate>
  oidcProviderFetch?: OidcProviderFetch
  oidcRandomValueCreate?: () => string
  oidcIdCreate?: () => string
  oidcNow?: () => Date
  oidcSessionCredentialCreate?: () => string
  oidcSessionIdCreate?: () => string
  oidcReturnToPathIsKnown?: typeof appKnownRouteResolve
  authCallbackRoute?: Hono<AppEnvironment>
  sessionChatAdapter?: typeof sessionChatAdapterCreate
  journalBacklogRead?: typeof journalBacklogRead
  journalCursorCodec?: JournalCursorCodec
  journalPostCommitPublish?: ReturnType<typeof journalPostCommitPublishCreate>
  streamLiveSubscription?: ReturnType<typeof streamLiveSubscriptionCreate>
  streamSseConnectionWriterCreate?: typeof streamSseConnectionWriterCreate
  streamSseNow?: () => number
  streamSseScheduler?: Parameters<typeof streamSseConnectionWriterCreate>[0]["scheduler"]
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
  clientLogJournalWrite?: typeof apiClientLogJournalWrite
}

export function apiRoutesAdd(
  app: Hono<AppEnvironment>,
  databaseReadyCheck: () => Promise<Result<void>>,
  options: ApiRoutesAddOptions = {},
): void {
  const api = new Hono<AppEnvironment>()
  const errorCatalogResult = apiErrorCatalogCreate(runErrorCatalog)
  if (!errorCatalogResult.success) throw new Error(errorCatalogResult.errorMessage)

  api.use("*", async (context, next) => {
    context.set("streamLiveSubscription", options.streamLiveSubscription)
    await next()
  })

  api.get("/health", (context) => {
    const response = {
      service: "codeline",
      status: "ok",
    } satisfies HealthResponse

    return context.json(response)
  })

  apiReadinessRoutesAdd(api, databaseReadyCheck)
  apiDiagnosticsRoutesAdd(api, { clientLogJournalWrite: options.clientLogJournalWrite })
  if (options.metricsCollector !== undefined) apiMetricsRoutesAdd(api, options.metricsCollector)
  apiAuthRoutesAdd(api, {
    configuration: options.configuration,
    database: options.database,
    idCreate: options.oidcIdCreate,
    identitySessionRevoke: options.identitySessionRevoke,
    identitySessionCreate: options.identitySessionCreate,
    identitySessionLoad: options.identitySessionLoad,
    oidcIdentityUpsert: options.oidcIdentityUpsert,
    now: options.oidcNow,
    oidcLoginTransactionCreate: options.oidcLoginTransactionCreate,
    oidcLoginTransactionConsume: options.oidcLoginTransactionConsume,
    oidcProviderDiscovery: options.oidcProviderDiscovery,
    oidcProviderFetch: options.oidcProviderFetch,
    randomValueCreate: options.oidcRandomValueCreate,
    returnToPathIsKnown: options.oidcReturnToPathIsKnown,
    oidcSessionCredentialCreate: options.oidcSessionCredentialCreate,
    oidcSessionIdCreate: options.oidcSessionIdCreate,
    callbackRoute: options.authCallbackRoute ?? app,
  })
  apiServerRoutesAdd(api, { database: options.database })
  apiAgentRoutesAdd(api, {
    database: options.database,
    environment: options.providerEnvironment,
    fetch: options.providerFetch,
    providerAgentCatalog: options.providerAgentCatalog,
  })
  if (options.database !== undefined) {
    apiSessionExecutionSelectionDefaultRoutesAdd(api, {
      database: options.database,
      projectRootDirs: options.projectRootDirs,
      providerAgentCatalog: options.providerAgentCatalog,
    })
  }
  if (
    options.configuration !== undefined &&
    options.database !== undefined &&
    options.journalCursorCodec !== undefined &&
    options.journalPostCommitPublish !== undefined
  ) {
    apiSessionRoutesAdd(api, {
      ...options,
      database: options.database,
      journalCursorCodec: options.journalCursorCodec,
      journalPostCommitPublish: options.journalPostCommitPublish,
      metricsCollector: options.metricsCollector,
    })
  }
  apiRunRoutesAdd(api, {
    errorCatalog: errorCatalogResult.data,
    metricsCollector: options.metricsCollector,
    ...(options.journalCursorCodec === undefined ? {} : { journalCursorCodec: options.journalCursorCodec }),
    runCancel: options.runCancel,
    runActiveListLoad: options.runActiveListLoad,
    runActiveRegistry: options.runActiveRegistry,
    runActiveSnapshotLoad: options.runActiveSnapshotLoad,
    runCancellationCoordinator: options.runCancellationCoordinator,
    runLoad: options.runLoad,
    runSessionSnapshotLoad: options.runSessionSnapshotLoad,
  })
  if (
    options.configuration !== undefined &&
    options.database !== undefined &&
    options.journalCursorCodec !== undefined &&
    options.journalPostCommitPublish !== undefined
  ) {
    apiSessionBranchRoutesAdd(api, {
      database: options.database,
      journalPostCommitPublish: options.journalPostCommitPublish,
    })
    apiSessionRenameRoutesAdd(api, {
      database: options.database,
      journalCursorCodec: options.journalCursorCodec,
      journalPostCommitPublish: options.journalPostCommitPublish,
    })
    apiMessageRoutesAdd(api, {
      journalCursorCodec: options.journalCursorCodec,
      journalPostCommitPublish: options.journalPostCommitPublish,
    })
    apiNoteRoutesAdd(api, {
      database: options.database,
      journalPostCommitPublish: options.journalPostCommitPublish,
      projectRootDirs: options.projectRootDirs ?? [],
    })
  }
  apiProjectRoutesAdd(api, {
    database: options.database,
    limits: options.projectLimits,
    openCodeDatabasePath: options.openCodeDatabasePath ?? options.configuration?.openCodeDatabasePath,
    rootDirs: options.projectRootDirs ?? [],
  })
  apiCommandRoutesAdd(api, {
    commandCatalogDiscover: options.commandCatalogDiscover,
    globalCommandsPath: options.globalCommandsPath,
    projectRegistryDatabase: options.database,
    rootDirs: options.projectRootDirs ?? [],
  })
  apiAgentInstructionRoutesAdd(api, {
    agentInstructionsDiscover: options.agentInstructionsDiscover,
    globalAgentsPath: options.globalAgentsPath,
    projectRegistryDatabase: options.database,
    rootDirs: options.projectRootDirs ?? [],
  })
  apiSkillRoutesAdd(api, {
    database: options.database,
    globalSkillsPath: options.globalSkillsPath,
    projectRegistryDatabase: options.database,
    rootDirs: options.projectRootDirs ?? [],
    skillCatalogDiscover: options.skillCatalogDiscover,
    skillPresetCatalogLoad: options.skillPresetCatalogLoad,
  })
  apiProviderRoutesAdd(api, {
    configuration: options.providerConfiguration ?? { model: "development-default", provider: "deterministic" },
    environment: options.providerEnvironment ?? Bun.env,
    fetch: options.providerFetch ?? globalThis.fetch,
    providerAgentCatalog: options.providerAgentCatalog,
  })
  // The authenticated feed is only constructed when both its auth middleware and
  // opaque cursor codec are present. Partial API composition is allowed only
  // when the authenticated event route cannot be configured at all.
  if (
    options.journalBacklogRead === undefined ||
    options.streamSseConnectionWriterCreate === undefined ||
    options.streamSseNow === undefined ||
    options.streamSseScheduler === undefined ||
    options.streamLiveSubscription === undefined ||
    options.metricsCollector === undefined
  ) {
    if (
      options.configuration !== undefined &&
      options.database !== undefined &&
      options.journalCursorCodec !== undefined
    ) {
      throw new Error("The authenticated event feed dependencies are required.")
    }
  } else if (
    options.configuration !== undefined &&
    options.database !== undefined &&
    options.journalCursorCodec !== undefined
  ) {
    apiEventsRoutesAdd(api, {
      backlogRead: options.journalBacklogRead,
      connectionWriterCreate: options.streamSseConnectionWriterCreate,
      cursorCodec: options.journalCursorCodec,
      liveSubscription: options.streamLiveSubscription,
      now: options.streamSseNow,
      scheduler: options.streamSseScheduler,
      metricsCollector: options.metricsCollector,
    })
  }
  apiTestingRoutesAdd(api)
  app.route("/api", api)
}
