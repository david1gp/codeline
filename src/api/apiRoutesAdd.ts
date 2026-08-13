import type { Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import { apiAgentRoutesAdd } from "../agents/api/apiAgentRoutesAdd.js"
import { apiMessageRoutesAdd } from "../message/api/apiMessageRoutesAdd.js"
import { apiProjectRoutesAdd } from "../project/api/apiProjectRoutesAdd.js"
import type { ProjectLimits } from "../project/projectLimitsSchema.js"
import { apiProviderRoutesAdd } from "../providers/api/apiProviderRoutesAdd.js"
import type { ProviderModelDiscoveryOptions } from "../providers/runtime/providerModelDiscovery.js"
import { providerRuntimeAdapterCreate } from "../providers/runtime/providerRuntimeAdapterCreate.js"
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
  projectLimits?: ProjectLimits
  projectRootDir?: string
  providerConfiguration?: unknown
  providerEnvironment?: Readonly<Record<string, string | undefined>>
  providerFetch?: NonNullable<ProviderModelDiscoveryOptions["fetch"]>
  providerRuntimeAdapterCreate?: typeof providerRuntimeAdapterCreate
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
  apiSessionRenameRoutesAdd(api)
  apiMessageRoutesAdd(api)
  apiProjectRoutesAdd(api, { limits: options.projectLimits, rootDir: options.projectRootDir ?? process.cwd() })
  apiProviderRoutesAdd(api, {
    configuration: options.providerConfiguration ?? { model: "development-default", provider: "deterministic" },
    environment: options.providerEnvironment ?? Bun.env,
    fetch: options.providerFetch ?? globalThis.fetch,
  })
  apiStreamRoutesAdd(api, {
    inactivityTimeoutMs: options.streamInactivityTimeoutMs,
    replayServiceCreate: options.streamReplayServiceCreate,
  })
  apiMutationRoutesAdd(api)
  apiQueryRoutesAdd(api)
  apiTestingRoutesAdd(api)
  app.route("/api", api)
}
