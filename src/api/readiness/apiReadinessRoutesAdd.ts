import type { Result } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../appEnvironment.js"
import type { ApiErrorResponse } from "../errors/apiErrorResponseSchema.js"
import type { ReadinessResponse } from "./readinessResponseSchema.js"

export function apiReadinessRoutesAdd(
  api: Hono<AppEnvironment>,
  databaseReadyCheck: () => Promise<Result<void>>,
): void {
  api.get("/ready", async (context) => {
    const ready = await databaseReadyCheck()

    if (!ready.success) {
      const response = {
        error: {
          code: "database_not_ready",
          message: "The database is not ready.",
        },
      } satisfies ApiErrorResponse
      return context.json(response, 503)
    }

    const response = {
      database: "ready",
      service: "codeline",
      status: "ready",
    } satisfies ReadinessResponse
    return context.json(response)
  })
}
