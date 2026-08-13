import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { apiRoutesAdd } from "../api/apiRoutesAdd.js"
import type { App, AppEnvironment } from "../api/appEnvironment.js"
import type { ApiErrorResponse } from "../api/errors/apiErrorResponseSchema.js"
import type { HealthResponse } from "../api/health/healthResponseSchema.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import { databaseReadyCheck } from "../database/databaseReadyCheck.js"
import { developmentIdentityMiddleware } from "../identity/api/developmentIdentityMiddleware.js"
import type { ProjectLimits } from "../project/projectLimitsSchema.js"
import type { ProviderModelDiscoveryOptions } from "../providers/runtime/providerModelDiscovery.js"
import { providerRuntimeAdapterCreate } from "../providers/runtime/providerRuntimeAdapterCreate.js"
import { sessionChatAdapterCreate } from "../session/actions/sessionChatAdapterCreate.js"
import { streamReplayServiceCreate } from "../stream/actions/streamReplayServiceCreate.js"

export type AppCreateOptions = {
  configuration?: RuntimeConfiguration
  database?: DatabaseClient
  databaseReadyCheck?: typeof databaseReadyCheck
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

export function appCreate(options: AppCreateOptions = {}): App {
  const app = new Hono<AppEnvironment>()

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
    app.use("/api/*", developmentIdentityMiddleware(options.configuration, options.database))
  }

  apiRoutesAdd(app, readyCheck, {
    projectLimits: options.projectLimits,
    projectRootDir: options.projectRootDir ?? process.cwd(),
    providerConfiguration: options.providerConfiguration,
    providerEnvironment: options.providerEnvironment,
    providerFetch: options.providerFetch,
    providerRuntimeAdapterCreate: options.providerRuntimeAdapterCreate,
    sessionChatAdapter: options.sessionChatAdapter,
    streamInactivityTimeoutMs: options.streamInactivityTimeoutMs,
    streamReplayServiceCreate: options.streamReplayServiceCreate,
  })

  app.get("/", serveStatic({ path: "./dist/ui/index.html" }))
  app.get("/assets/*", serveStatic({ root: "./dist/ui" }))

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
