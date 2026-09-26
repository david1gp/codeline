import { createResultError } from "@adaptive-ds/result"
import * as v from "valibot"
import type { DatabaseExecutor, DatabaseTransaction } from "../../database/databaseClient.js"
import { databaseExecutorTransactionRun } from "../../database/databaseExecutorTransactionRun.js"
import { type JournalEventAppendInput, journalEventAppendInputSchema } from "../schema/journalEventAppendInputSchema.js"
import type { JournalEventRecipientResolver } from "./journalEventRecipientResolver.js"
import { journalEventRecipientsResolve } from "./journalEventRecipientsResolve.js"
import { journalEventsAppendPersist } from "./journalEventsAppendPersist.js"

export async function journalEventsAppend(
  database: DatabaseExecutor,
  input: JournalEventAppendInput,
  resolveRecipients: JournalEventRecipientResolver,
): ReturnType<typeof journalEventsAppendPersist> {
  const op = "journalEventsAppend"
  const parsedInput = v.safeParse(journalEventAppendInputSchema, input)
  if (!parsedInput.success) return createResultError(op, "The journal event input is invalid.")

  return databaseExecutorTransactionRun(database, async (transaction) => {
    const recipients = await journalEventRecipientsResolve(
      transaction as DatabaseTransaction,
      parsedInput.output.resource,
      resolveRecipients,
    )
    if (!recipients.success) return createResultError(op, recipients.errorMessage)
    return journalEventsAppendPersist(transaction, parsedInput.output, recipients.data, false)
  })
}
