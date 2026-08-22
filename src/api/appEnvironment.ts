import type { Hono } from "hono"
import type { ServerAgentConvexClient } from "../convex/serverAgentConvexClient.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import type { RequestIdentity } from "../identity/requestIdentity.js"
import type { streamLiveSubscriptionCreate } from "../stream/actions/streamLiveSubscriptionCreate.js"

export type AppEnvironment = {
  Variables: {
    database: DatabaseClient
    requestIdentity: RequestIdentity
    streamLiveSubscription?: ReturnType<typeof streamLiveSubscriptionCreate>
    serverAgentConvexClient?: ServerAgentConvexClient
  }
}

export type App = Hono<AppEnvironment>
