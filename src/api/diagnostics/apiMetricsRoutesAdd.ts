import { Hono } from "hono"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import type { AppEnvironment } from "../appEnvironment.js"
import type { ApiErrorResponse } from "../errors/apiErrorResponseSchema.js"

export function apiMetricsRoutesAdd(
  api: Hono<AppEnvironment>,
  metricsCollector: ReturnType<typeof metricsCollectorCreate>,
): void {
  api.get("/diagnostics/metrics", (context) => {
    if (context.var.requestIdentity === undefined) {
      const response = {
        error: { code: "unauthorized", message: "Authentication is required." },
      } satisfies ApiErrorResponse
      context.header("Cache-Control", "no-store")
      return context.json(response, 401)
    }

    context.header("Cache-Control", "no-store")
    return context.json(metricsCollector.snapshot())
  })
}
