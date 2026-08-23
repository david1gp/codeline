import type { Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import { apiAgentRoutesAdd } from "../agents/api/apiAgentRoutesAdd.js"
import { appKnownRouteResolve } from "../app/appKnownRouteResolve.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import { apiEventsRoutesAdd } from "../events/api/apiEventsRoutesAdd.js"
import { identitySessionRevoke } from "../identity/actions/identitySessionRevoke.js"
import { apiAuthRoutesAdd } from "../identity/api/apiAuthRoutesAdd.js"
import { oidcLoginTransactionCreate } from "../identity/db/oidcLoginTransactionCreate.js"
import { oidcProviderDiscoveryCreate } from "../identity/oidc/oidcProviderDiscoveryCreate.js"
import type { OidcProviderFetch } from "../identity/oidc/oidcProviderFetch.js"
import { journalBacklogRead } from "../journal/actions/journalBacklogRead.js"
import type { JournalCursorCodec } from "../journal/actions/journalCursorCodecCreate.js"
import { journalPostCommitPublishCreate } from "../journal/actions/journalPostCommitPublishCreate.js"
import { apiMessageRoutesAdd } from "../message/api/apiMessageRoutesAdd.js"
import { apiNoteRoutesAdd } from "../note/api/apiNoteRoutesAdd.js"
import { apiProjectRoutesAdd } from "../project/api/apiProjectRoutesAdd.js"
import type { ProjectLimits } from "../project/projectLimitsSchema.js"
import { apiProviderRoutesAdd } from "../providers/api/apiProviderRoutesAdd.js"
import { providerDelegationToolLoopCreate } from "../providers/runtime/providerDelegationToolLoopCreate.js"
import type { ProviderModelDiscoveryOptions } from "../providers/runtime/providerModelDiscovery.js"
import { providerRuntimeAdapterCreate } from "../providers/runtime/providerRuntimeAdapterCreate.js"
import type { ProviderCatalog } from "../providers/schema/providerCatalogSchema.js"
import { runCancel } from "../run/actions/runCancel.js"
import { runCancellationCoordinatorCreate } from "../run/actions/runCancellationCoordinatorCreate.js"
import { runChildCreate } from "../run/actions/runChildCreate.js"
import { runChildStreamResolve } from "../run/actions/runChildStreamResolve.js"
import { runCreate } from "../run/actions/runCreate.js"
import { runDelegationExecute } from "../run/actions/runDelegationExecute.js"
import { runDelegationFinalize } from "../run/actions/runDelegationFinalize.js"
import { runExecutionSnapshotResolve } from "../run/actions/runExecutionSnapshotResolve.js"
import { runLoad } from "../run/actions/runLoad.js"
import { runRetryAttemptCreate } from "../run/actions/runRetryAttemptCreate.js"
import { runSessionStreamSnapshotLoad } from "../run/actions/runSessionStreamSnapshotLoad.js"
import { runTransition } from "../run/actions/runTransition.js"
import { apiRunRoutesAdd } from "../run/api/apiRunRoutesAdd.js"
import { apiServerRoutesAdd } from "../servers/api/apiServerRoutesAdd.js"
import { sessionChatAdapterCreate } from "../session/actions/sessionChatAdapterCreate.js"
import { apiSessionBranchRoutesAdd } from "../session/api/apiSessionBranchRoutesAdd.js"
import { apiSessionRenameRoutesAdd } from "../session/api/apiSessionRenameRoutesAdd.js"
import { apiSessionRoutesAdd } from "../session/api/apiSessionRoutesAdd.js"
import { streamLiveSubscriptionCreate } from "../stream/actions/streamLiveSubscriptionCreate.js"
import { streamReplayServiceCreate } from "../stream/actions/streamReplayServiceCreate.js"
import { streamSseConnectionWriterCreate } from "../stream/actions/streamSseConnectionWriterCreate.js"
import { apiStreamRoutesAdd } from "../stream/api/apiStreamRoutesAdd.js"
import type { AppEnvironment } from "./appEnvironment.js"
import type { HealthResponse } from "./health/healthResponseSchema.js"
import { apiReadinessRoutesAdd } from "./readiness/apiReadinessRoutesAdd.js"
import { apiTestingRoutesAdd } from "./testing/apiTestingRoutesAdd.js"

type ApiRoutesAddOptions = {
  configuration?: RuntimeConfiguration
  configurationStore?: ConfigurationStore
  database?: DatabaseClient
  projectLimits?: ProjectLimits
  projectRootDirs?: readonly string[]
  projectRootDir?: string
  providerConfiguration?: unknown
  providerAgentCatalog?: ProviderCatalog
  providerEnvironment?: Readonly<Record<string, string | undefined>>
  providerDelegationToolLoopCreate?: typeof providerDelegationToolLoopCreate
  providerFetch?: NonNullable<ProviderModelDiscoveryOptions["fetch"]>
  providerRuntimeAdapterCreate?: typeof providerRuntimeAdapterCreate
  runCreate?: typeof runCreate
  runCancel?: typeof runCancel
  runCancellationCoordinator?: ReturnType<typeof runCancellationCoordinatorCreate>
  runChildCreate?: typeof runChildCreate
  runChildStreamResolve?: typeof runChildStreamResolve
  runDelegationExecute?: typeof runDelegationExecute
  runDelegationFinalize?: typeof runDelegationFinalize
  runExecutionSnapshotResolve?: typeof runExecutionSnapshotResolve
  runLoad?: typeof runLoad
  runRetryAttemptCreate?: typeof runRetryAttemptCreate
  runSessionStreamSnapshotLoad?: typeof runSessionStreamSnapshotLoad
  runTransition?: typeof runTransition
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
  streamInactivityTimeoutMs?: number
  streamReplayServiceCreate?: typeof streamReplayServiceCreate
  journalBacklogRead?: typeof journalBacklogRead
  journalCursorCodec?: JournalCursorCodec
  journalPostCommitPublish?: ReturnType<typeof journalPostCommitPublishCreate>
  streamLiveSubscription?: ReturnType<typeof streamLiveSubscriptionCreate>
  streamSseConnectionWriterCreate?: typeof streamSseConnectionWriterCreate
  streamSseNow?: () => number
  streamSseScheduler?: Parameters<typeof streamSseConnectionWriterCreate>[0]["scheduler"]
}

export function apiRoutesAdd(
  app: Hono<AppEnvironment>,
  databaseReadyCheck: () => Promise<Result<void>>,
  options: ApiRoutesAddOptions = {},
): void {
  const api = new Hono<AppEnvironment>()
  const streamLiveSubscription = options.streamLiveSubscription ?? streamLiveSubscriptionCreate()
  const journalPostCommitPublish =
    options.journalPostCommitPublish ??
    (options.journalCursorCodec === undefined
      ? undefined
      : journalPostCommitPublishCreate({
          cursorCodec: options.journalCursorCodec,
          liveSubscription: streamLiveSubscription,
        }))

  api.use("*", async (context, next) => {
    context.set("streamLiveSubscription", streamLiveSubscription)
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
  })
  if (
    options.configuration !== undefined &&
    options.database !== undefined &&
    options.journalCursorCodec !== undefined &&
    journalPostCommitPublish !== undefined
  ) {
    apiSessionRoutesAdd(api, {
      ...options,
      database: options.database,
      journalCursorCodec: options.journalCursorCodec,
      journalPostCommitPublish,
    })
  }
  apiRunRoutesAdd(api, {
    runCancel: options.runCancel,
    runCancellationCoordinator: options.runCancellationCoordinator,
    runLoad: options.runLoad,
    runSessionStreamSnapshotLoad: options.runSessionStreamSnapshotLoad,
  })
  if (
    options.configuration !== undefined &&
    options.database !== undefined &&
    options.journalCursorCodec !== undefined &&
    journalPostCommitPublish !== undefined
  ) {
    apiSessionBranchRoutesAdd(api, { database: options.database, journalPostCommitPublish })
    apiSessionRenameRoutesAdd(api, {
      database: options.database,
      journalCursorCodec: options.journalCursorCodec,
      journalPostCommitPublish,
    })
    apiMessageRoutesAdd(api, {
      journalCursorCodec: options.journalCursorCodec,
      journalPostCommitPublish,
    })
    apiNoteRoutesAdd(api, {
      database: options.database,
      journalPostCommitPublish,
    })
  }
  if (options.projectRootDir !== undefined) {
    apiProjectRoutesAdd(api, { limits: options.projectLimits, rootDir: options.projectRootDir })
  } else if (options.projectRootDirs !== undefined) {
    apiProjectRoutesAdd(api, { limits: options.projectLimits, rootDirs: options.projectRootDirs })
  } else {
    apiProjectRoutesAdd(api, { limits: options.projectLimits, rootDirs: [] })
  }
  apiProviderRoutesAdd(api, {
    configuration: options.providerConfiguration ?? { model: "development-default", provider: "deterministic" },
    environment: options.providerEnvironment ?? Bun.env,
    fetch: options.providerFetch ?? globalThis.fetch,
    providerAgentCatalog: options.providerAgentCatalog,
  })
  apiStreamRoutesAdd(api, {
    childStreamResolve: options.runChildStreamResolve,
    inactivityTimeoutMs: options.streamInactivityTimeoutMs,
    replayServiceCreate: options.streamReplayServiceCreate,
  })
  // The authenticated feed is only constructed when both its auth middleware and
  // opaque cursor codec are present. It must not be exposed as a route that can
  // discover a missing production dependency with a runtime 503.
  if (
    options.configuration !== undefined &&
    options.database !== undefined &&
    options.journalCursorCodec !== undefined
  ) {
    apiEventsRoutesAdd(api, {
      backlogRead: options.journalBacklogRead,
      connectionWriterCreate: options.streamSseConnectionWriterCreate,
      cursorCodec: options.journalCursorCodec,
      liveSubscription: streamLiveSubscription,
      now: options.streamSseNow,
      scheduler: options.streamSseScheduler,
    })
  }
  apiTestingRoutesAdd(api)
  app.route("/api", api)
}
