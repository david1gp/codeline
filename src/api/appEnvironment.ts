import type { Hono } from "hono"
import type { DatabaseClient } from "../database/databaseClient.js"
import type { RequestIdentity } from "../identity/requestIdentity.js"

export type AppEnvironment = {
  Variables: {
    database: DatabaseClient
    requestIdentity: RequestIdentity
  }
}

export type App = Hono<AppEnvironment>
