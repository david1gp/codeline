import { Hono } from "hono"
import type { Result } from "@adaptive-ds/result"
import type { AppEnvironment } from "./appEnvironment.js"
import type { HealthResponse } from "./health/healthResponseSchema.js"
import { apiReadinessRoutesAdd } from "./readiness/apiReadinessRoutesAdd.js"
import { apiServerRoutesAdd } from "./servers/apiServerRoutesAdd.js"
import { apiSessionRoutesAdd } from "./sessions/apiSessionRoutesAdd.js"
import { apiTestingRoutesAdd } from "./testing/apiTestingRoutesAdd.js"

export function apiRoutesAdd(app: Hono<AppEnvironment>, databaseReadyCheck: () => Promise<Result<void>>): void {
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
  apiSessionRoutesAdd(api)
  apiTestingRoutesAdd(api)
  app.route("/api", api)
}
