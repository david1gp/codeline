import { mustGetMutator } from "@rocicorp/zero"
import { handleMutateRequest } from "@rocicorp/zero/server"
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle"
import { Hono } from "hono"
import type { AppEnvironment } from "../appEnvironment.js"
import { noteMutators } from "../../note/noteMutators.js"
import { zeroSchema } from "../../database/zeroSchema.js"

const localDevelopmentIdentity = "local-development"
const localDevelopmentUserId = "development:local-development"

export function apiMutationRoutesAdd(api: Hono<AppEnvironment>): void {
  api.post("/mutate", async (context) => {
    const response = await handleMutateRequest({
      body: await context.req.json().catch(() => null),
      dbProvider: zeroDrizzle(zeroSchema, context.var.database),
      handler: (transact) =>
        transact((tx, name, args) =>
          mustGetMutator(noteMutators, name).fn({
            args,
            ctx: { userId: localDevelopmentUserId },
            tx,
          }),
        ),
      query: context.req.query(),
      userID: localDevelopmentIdentity,
    })

    return context.json(response)
  })
}
