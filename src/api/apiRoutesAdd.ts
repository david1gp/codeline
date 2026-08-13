import { Hono } from "hono"
import type { Result } from "@adaptive-ds/result"
import type { AppEnvironment } from "./appEnvironment.js"
import type { HealthResponse } from "./health/healthResponseSchema.js"
import { apiAgentRoutesAdd } from "../agents/api/apiAgentRoutesAdd.js"
import { apiMessageRoutesAdd } from "../message/api/apiMessageRoutesAdd.js"
import { apiQueryRoutesAdd } from "./query/apiQueryRoutesAdd.js"
import { apiServerRoutesAdd } from "../servers/api/apiServerRoutesAdd.js"
import { apiSessionRoutesAdd } from "../session/api/apiSessionRoutesAdd.js"
import { sessionChatAdapterCreate } from "../session/actions/sessionChatAdapterCreate.js"
import { apiReadinessRoutesAdd } from "./readiness/apiReadinessRoutesAdd.js"
import { apiTestingRoutesAdd } from "./testing/apiTestingRoutesAdd.js"

type ApiRoutesAddOptions = {
  sessionChatAdapter?: typeof sessionChatAdapterCreate
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
  apiMessageRoutesAdd(api)
  apiQueryRoutesAdd(api)
  apiTestingRoutesAdd(api)
  app.route("/api", api)
}
