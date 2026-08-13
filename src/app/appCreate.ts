import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { apiRoutesAdd } from "../api/apiRoutesAdd.js"
import type { App, AppEnvironment } from "../api/appEnvironment.js"
import { developmentIdentityMiddleware } from "../identity/api/developmentIdentityMiddleware.js"
import type { ApiErrorResponse } from "../api/errors/apiErrorResponseSchema.js"
import type { HealthResponse } from "../api/health/healthResponseSchema.js"
import { databaseReadyCheck } from "../database/databaseReadyCheck.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import type { RuntimeConfiguration } from "../configuration/runtimeConfigurationSchema.js"

export type AppCreateOptions = {
  configuration?: RuntimeConfiguration
  database?: DatabaseClient
  databaseReadyCheck?: typeof databaseReadyCheck
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

  apiRoutesAdd(app, readyCheck)

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
