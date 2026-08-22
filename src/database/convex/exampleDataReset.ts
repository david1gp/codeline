import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { GenericMutationCtx } from "convex/server"
import { exampleDataFixture } from "../exampleDataFixture.js"

type ExampleDataMutationContext = Pick<GenericMutationCtx<any>, "db">

export async function exampleDataReset(context: ExampleDataMutationContext): Promise<Result<{ messageCount: number }>> {
  const op = "exampleDataReset"

  try {
    let messageCount = 0
    for (const message of exampleDataFixture.sessions.flatMap((session) => session.messages)) {
      const existingMessage = await context.db
        .query("messages")
        .withIndex("id", (query: any) => query.eq("id", message.id))
        .first()
      if (existingMessage === null) continue
      await context.db.delete("messages", existingMessage._id)
      messageCount += 1
    }
    return createResult({ messageCount })
  } catch (_error) {
    return createResultError(op, "The example data messages could not be reset.")
  }
}
