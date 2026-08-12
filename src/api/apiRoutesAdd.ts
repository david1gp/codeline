import { Hono } from "hono"
import type { HealthResponse } from "./health/healthResponseSchema.js"
import { apiTestingRoutesAdd } from "./testing/apiTestingRoutesAdd.js"

export function apiRoutesAdd(app: Hono): void {
  const api = new Hono()

  api.get("/health", (context) => {
    const response = {
      service: "codeline",
      status: "ok",
    } satisfies HealthResponse

    return context.json(response)
  })

  apiTestingRoutesAdd(api)
  app.route("/api", api)
}
