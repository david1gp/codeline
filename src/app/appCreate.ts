import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { apiRoutesAdd } from "../api/apiRoutesAdd.js"
import type { ApiErrorResponse } from "../api/errors/apiErrorResponseSchema.js"
import type { HealthResponse } from "../api/health/healthResponseSchema.js"

export function appCreate(): Hono {
  const app = new Hono()

  app.get("/health", (context) => {
    const response = {
      service: "codeline",
      status: "ok",
    } satisfies HealthResponse

    return context.json(response)
  })

  apiRoutesAdd(app)

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
