import type { Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import { apiAgentRoutesAdd } from "../agents/api/apiAgentRoutesAdd.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import { identitySessionRevoke } from "../identity/actions/identitySessionRevoke.js"
import { apiAuthRoutesAdd } from "../identity/api/apiAuthRoutesAdd.js"
import { oidcLoginTransactionCreate } from "../identity/db/oidcLoginTransactionCreate.js"
import { oidcProviderDiscoveryCreate } from "../identity/oidc/oidcProviderDiscoveryCreate.js"
import type { OidcProviderFetch } from "../identity/oidc/oidcProviderFetch.js"
import { appKnownRouteResolve } from "../app/appKnownRouteResolve.js"
import { apiMessageRoutesAdd } from "../message/api/apiMessageRoutesAdd.js"
import { apiProjectRoutesAdd } from "../project/api/apiProjectRoutesAdd.js"
import type { ProjectLimits } from "../project/projectLimitsSchema.js"
import { apiProviderRoutesAdd } from "../providers/api/apiProviderRoutesAdd.js"
import type { ProviderModelDiscoveryOptions } from "../providers/runtime/providerModelDiscovery.js"
import { providerRuntimeAdapterCreate } from "../providers/runtime/providerRuntimeAdapterCreate.js"
import { providerDelegationToolLoopCreate } from "../providers/runtime/providerDelegationToolLoopCreate.js"
import { apiRunRoutesAdd } from "../run/api/apiRunRoutesAdd.js"
import { runCreate } from "../run/actions/runCreate.js"
import { runCancel } from "../run/actions/runCancel.js"
import { runCancellationCoordinatorCreate } from "../run/actions/runCancellationCoordinatorCreate.js"
import { runChildStreamResolve } from "../run/actions/runChildStreamResolve.js"
import { runDelegationExecute } from "../run/actions/runDelegationExecute.js"
import { runExecutionSnapshotResolve } from "../run/actions/runExecutionSnapshotResolve.js"
import { runLoad } from "../run/actions/runLoad.js"
import { runRetryAttemptCreate } from "../run/actions/runRetryAttemptCreate.js"
import { runTransition } from "../run/actions/runTransition.js"
import { apiServerRoutesAdd } from "../servers/api/apiServerRoutesAdd.js"
import { sessionChatAdapterCreate } from "../session/actions/sessionChatAdapterCreate.js"
import { apiSessionRenameRoutesAdd } from "../session/api/apiSessionRenameRoutesAdd.js"
import { apiSessionRoutesAdd } from "../session/api/apiSessionRoutesAdd.js"
import { streamReplayServiceCreate } from "../stream/actions/streamReplayServiceCreate.js"
import { apiStreamRoutesAdd } from "../stream/api/apiStreamRoutesAdd.js"
import type { AppEnvironment } from "./appEnvironment.js"
import type { HealthResponse } from "./health/healthResponseSchema.js"
import { apiMutationRoutesAdd } from "./mutation/apiMutationRoutesAdd.js"
import { apiQueryRoutesAdd } from "./query/apiQueryRoutesAdd.js"
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
  providerEnvironment?: Readonly<Record<string, string | undefined>>
  providerDelegationToolLoopCreate?: typeof providerDelegationToolLoopCreate
  providerFetch?: NonNullable<ProviderModelDiscoveryOptions["fetch"]>
  providerRuntimeAdapterCreate?: typeof providerRuntimeAdapterCreate
  runCreate?: typeof runCreate
  runCancel?: typeof runCancel
  runCancellationCoordinator?: ReturnType<typeof runCancellationCoordinatorCreate>
  runChildStreamResolve?: typeof runChildStreamResolve
  runDelegationExecute?: typeof runDelegationExecute
  runExecutionSnapshotResolve?: typeof runExecutionSnapshotResolve
  runLoad?: typeof runLoad
  runRetryAttemptCreate?: typeof runRetryAttemptCreate
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
}

export function apiRoutesAdd(
  app: Hono<AppEnvironment>,
  databaseReadyCheck: () => Promise<Result<void>>,
  options: ApiRoutesAddOptions = {},
): void {
  const api = new Hono<AppEnvironment>()

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
  apiServerRoutesAdd(api)
  apiAgentRoutesAdd(api, {
    environment: options.providerEnvironment,
    fetch: options.providerFetch,
  })
  apiSessionRoutesAdd(api, options)
  apiRunRoutesAdd(api, {
    runCancel: options.runCancel,
    runCancellationCoordinator: options.runCancellationCoordinator,
    runLoad: options.runLoad,
  })
  apiSessionRenameRoutesAdd(api)
  apiMessageRoutesAdd(api)
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
  })
  apiStreamRoutesAdd(api, {
    childStreamResolve: options.runChildStreamResolve,
    inactivityTimeoutMs: options.streamInactivityTimeoutMs,
    replayServiceCreate: options.streamReplayServiceCreate,
  })
  apiMutationRoutesAdd(api)
  apiQueryRoutesAdd(api)
  apiTestingRoutesAdd(api)
  app.route("/api", api)
}
