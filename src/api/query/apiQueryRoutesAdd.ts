import { mustGetQuery } from "@rocicorp/zero"
import { handleQueryRequest } from "@rocicorp/zero/server"
import { Hono } from "hono"
import type { AppEnvironment } from "../appEnvironment.js"
import { codelineQueries } from "../../ui/codelineQueries.js"
import { zeroSchema } from "../../database/zeroSchema.js"

const localDevelopmentIdentity = "local-development"

export function apiQueryRoutesAdd(api: Hono<AppEnvironment>): void {
  api.post("/query", async (context) => {
    const body = await context.req.json().catch(() => null)
    const response = await handleQueryRequest({
      body,
      handler: (name, args) => mustGetQuery(codelineQueries, name).fn({ args }),
      query: context.req.query(),
      schema: zeroSchema,
      userID: localDevelopmentIdentity,
    })

    return context.json(response)
  })
}
