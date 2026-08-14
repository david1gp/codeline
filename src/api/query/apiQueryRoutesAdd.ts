import { mustGetQuery } from "@rocicorp/zero"
import { handleQueryRequest } from "@rocicorp/zero/server"
import { Hono } from "hono"
import { zeroSchema } from "../../database/zeroSchema.js"
import { codelineQueries } from "../../ui/codelineQueries.js"
import type { AppEnvironment } from "../appEnvironment.js"

export function apiQueryRoutesAdd(api: Hono<AppEnvironment>): void {
  api.post("/query", async (context) => {
    const body = await context.req.json().catch(() => null)
    const userId = context.var.requestIdentity.userId
    const response = await handleQueryRequest({
      body,
      handler: (name, args) => mustGetQuery(codelineQueries, name).fn({ args, ctx: { userId } }),
      query: context.req.query(),
      schema: zeroSchema,
      userID: userId,
    })

    return context.json(response)
  })
}
