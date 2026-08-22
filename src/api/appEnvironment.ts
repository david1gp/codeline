import type { Hono } from "hono"
import type { ServerAgentConvexClient } from "../convex/serverAgentConvexClient.js"
import type { SessionNoteConvexClient } from "../convex/sessionNoteConvexClient.js"
import type { DatabaseClient } from "../database/databaseClient.js"
import type { RequestIdentity } from "../identity/requestIdentity.js"

export type AppEnvironment = {
  Variables: {
    database: DatabaseClient
    requestIdentity: RequestIdentity
    serverAgentConvexClient?: ServerAgentConvexClient
    sessionNoteConvexClient?: SessionNoteConvexClient
  }
}

export type App = Hono<AppEnvironment>
