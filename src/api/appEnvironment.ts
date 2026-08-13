import type { Hono } from "hono"
import type { DatabaseClient } from "../database/databaseClient.js"
import type { DevelopmentUser } from "../identity/db/developmentUserUpsert.js"

export type AppEnvironment = {
  Variables: {
    database: DatabaseClient
    developmentUser: DevelopmentUser
  }
}

export type App = Hono<AppEnvironment>
