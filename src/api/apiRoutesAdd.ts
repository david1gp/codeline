import type { Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import { apiAgentRoutesAdd } from "../agents/api/apiAgentRoutesAdd.js"
import type { ConfigurationStore } from "../configuration/configurationStore.js"
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
  configurationStore?: ConfigurationStore
  projectLimits?: ProjectLimits
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
  apiServerRoutesAdd(api)
  apiAgentRoutesAdd(api)
  apiSessionRoutesAdd(api, options)
  apiRunRoutesAdd(api, {
    runCancel: options.runCancel,
    runCancellationCoordinator: options.runCancellationCoordinator,
    runLoad: options.runLoad,
  })
  apiSessionRenameRoutesAdd(api)
  apiMessageRoutesAdd(api)
  apiProjectRoutesAdd(api, { limits: options.projectLimits, rootDir: options.projectRootDir ?? process.cwd() })
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
