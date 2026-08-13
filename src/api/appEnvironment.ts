import type { Hono } from "hono"
import type { DatabaseClient } from "../database/databaseClient.js"
import type { DevelopmentUser } from "../database/repository/developmentUserUpsert.js"

export type AppEnvironment = {
  Variables: {
    database: DatabaseClient
    developmentUser: DevelopmentUser
  }
}

export type App = Hono<AppEnvironment>
