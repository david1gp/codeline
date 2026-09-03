import { createResult, createResultError, createResultErrorCode, type Result } from "@adaptive-ds/result"
import * as v from "valibot"
import { apiPublicIdSchema } from "../../api/schema/apiPublicIdSchema.js"
import type { DatabaseExecutor, DatabaseTransaction } from "../../database/databaseClient.js"
import { databaseTransactionRun } from "../../database/databaseTransactionRun.js"
import { journalEventTable } from "../db/journalEventTable.js"
import { journalAuthorizedUserIdsSchema } from "../schema/journalAuthorizedUserIdsSchema.js"
import { type JournalEventAppendInput, journalEventAppendInputSchema } from "../schema/journalEventAppendInputSchema.js"
import { type JournalEventResource, journalEventResourceSchema } from "../schema/journalEventResourceSchema.js"
import type { JournalEventRecipientResolver } from "./journalEventRecipientResolver.js"
import { journalEventRecipientsResolve } from "./journalEventRecipientsResolve.js"
import { journalEventsAppendPersist } from "./journalEventsAppendPersist.js"
import { journalSequenceLocksAcquire } from "./journalSequenceLocksAcquire.js"

type JournalEvent = typeof journalEventTable.$inferSelect
type JournalPublicationCallback = ((events: readonly JournalEvent[]) => Result<void> | Promise<Result<void>>) & {
  schedulePrune?: (userIds: readonly string[]) => void
}
type JournalPreparedRecipients = {
  resource: JournalEventResource
  userIds: string[]
}

type JournalTransaction = {
  append: (input: JournalEventAppendInput) => ReturnType<typeof journalEventsAppendPersist>
}

/**
 * `resources` are resolved against the supplied concrete domain resolver before any counter is locked.
 * `additionalRecipientIds` is for journal maintenance recipients, such as users with prior deltas.
 * Both sets are locked in one sorted operation before `mutate` or `write` runs.
 *
 * Future domain call sites must provide a resolver that queries that domain's concrete authorization
 * tables using this transaction. This journal foundation intentionally does not provide a generic
 * production authorization query while the domains are still being migrated.
 */
type JournalWritePlan<T> = {
  additionalRecipientIds?: (transaction: DatabaseTransaction) => Promise<Result<readonly string[]>>
  beforeMutation?: (transaction: DatabaseTransaction) => Promise<Result<void>>
  mutate?: (transaction: DatabaseTransaction) => Promise<Result<T>>
  resources:
    | readonly JournalEventResource[]
    | ((transaction: DatabaseTransaction) => Promise<Result<readonly JournalEventResource[]>>)
  write: (transaction: DatabaseTransaction, journal: JournalTransaction) => Promise<Result<void>>
}

type JournalWriteCreateDependencies = {
  appendPersist?: typeof journalEventsAppendPersist
  database: DatabaseExecutor
  postCommitPublish: JournalPublicationCallback
  resolveRecipients: JournalEventRecipientResolver
}

type JournalPublicationReservation = {
  cancel: () => void
  publish: (callback: JournalPublicationCallback) => Promise<Result<void>>
  userIds: readonly string[]
}

const journalPublicationQueueByUserId = new Map<string, Promise<void>>()

function journalResourceKey(resource: JournalEventResource): string {
  return `${resource.resourceType}\u0000${resource.resourceId}`
}

function journalUserIdsNormalize(userIds: readonly string[], requireNonEmpty = true): Result<string[]> {
  const op = "journalWriteCreate"
  const parsedUserIds = v.safeParse(
    requireNonEmpty ? journalAuthorizedUserIdsSchema : v.pipe(v.array(apiPublicIdSchema), v.maxLength(256)),
    userIds,
  )
  if (!parsedUserIds.success) return createResultError(op, "The additional journal recipients are invalid.")
  const normalized = [...new Set(parsedUserIds.output)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  if (requireNonEmpty && normalized.length === 0)
    return createResultError(op, "The journal transaction has no recipients.")
  return createResult(normalized)
}

function journalPublicationReserve(events: readonly JournalEvent[]): JournalPublicationReservation {
  const userIds = [...new Set(events.map((event) => event.userId))].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
  const prior = Promise.all(userIds.map((userId) => journalPublicationQueueByUserId.get(userId) ?? Promise.resolve()))
  let releaseGate: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve
  })
  const current = prior.then(() => gate)
  for (const userId of userIds) journalPublicationQueueByUserId.set(userId, current)

  let released = false
  const release = () => {
    if (released) return
    released = true
    releaseGate?.()
  }
  current.then(() => {
    for (const userId of userIds) {
      if (journalPublicationQueueByUserId.get(userId) === current) journalPublicationQueueByUserId.delete(userId)
    }
  })

  return {
    cancel: release,
    publish: async (callback) => {
      await prior
      if (released) return createResult(undefined)

      let published: Result<void>
      try {
        published = await callback(events)
      } catch (_error) {
        published = createResultError("journalPostCommitPublish", "The post-commit publisher failed.")
      }
      release()
      return published
    },
    userIds,
  }
}

function journalPublicationFailure(errorMessage: string): ReturnType<typeof createResultErrorCode> {
  const result = createResultErrorCode(
    "journalWriteRun",
    "The transaction committed and the journal is durable, but post-commit publication failed; reconnect replay is the recovery path.",
    "journal_publication_failed",
  )
  result.errorData = JSON.stringify({
    committed: true,
    durableJournal: true,
    publicationFailed: true,
    recovery: "journal-replay-on-reconnect",
    cause: errorMessage,
  })
  return result
}

async function journalRecipientsPrepare(
  transaction: DatabaseTransaction,
  resources: readonly JournalEventResource[],
  dependencies: JournalWriteCreateDependencies,
  additionalRecipientIds?: (transaction: DatabaseTransaction) => Promise<Result<readonly string[]>>,
): Promise<Result<{ preparedRecipients: Map<string, JournalPreparedRecipients> }>> {
  const op = "journalWriteCreate"
  const preparedRecipients = new Map<string, JournalPreparedRecipients>()
  const userIds: string[] = []

  for (const resource of resources) {
    const parsedResource = v.safeParse(journalEventResourceSchema, resource)
    if (!parsedResource.success) return createResultError(op, "The journal event resource is invalid.")
    const key = journalResourceKey(parsedResource.output)
    if (preparedRecipients.has(key)) continue

    const resolved = await journalEventRecipientsResolve(
      transaction,
      parsedResource.output,
      dependencies.resolveRecipients,
    )
    if (!resolved.success) return createResultError(op, resolved.errorMessage)
    preparedRecipients.set(key, { resource: parsedResource.output, userIds: resolved.data })
    userIds.push(...resolved.data)
  }

  if (additionalRecipientIds !== undefined) {
    let additional: Result<readonly string[]>
    try {
      additional = await additionalRecipientIds(transaction)
    } catch (_error) {
      return createResultError(op, "The additional journal recipients could not be resolved.")
    }
    if (!additional.success) return createResultError(op, additional.errorMessage)
    const normalizedAdditional = journalUserIdsNormalize(additional.data, false)
    if (!normalizedAdditional.success) return normalizedAdditional
    userIds.push(...normalizedAdditional.data)
  }

  const normalizedUserIds = journalUserIdsNormalize(userIds)
  if (!normalizedUserIds.success) return normalizedUserIds
  const locked = await journalSequenceLocksAcquire(transaction, normalizedUserIds.data)
  if (!locked.success) return createResultError(op, locked.errorMessage)
  return createResult({ preparedRecipients })
}

export function journalWriteCreate(dependencies: JournalWriteCreateDependencies) {
  const appendPersist = dependencies.appendPersist ?? journalEventsAppendPersist

  const publicationComplete = async <T>(
    committed: Result<T>,
    reservation: JournalPublicationReservation | undefined,
  ): Promise<Result<T>> => {
    if (!committed.success) {
      reservation?.cancel()
      return committed
    }

    if (reservation !== undefined) {
      const published = await reservation.publish(dependencies.postCommitPublish)
      try {
        dependencies.postCommitPublish.schedulePrune?.(reservation.userIds)
      } catch (error) {
        // Post-commit maintenance must not change the outcome of a committed write or publication.
        console.error("Journal event pruning could not be scheduled.", error)
      }
      if (!published.success) return journalPublicationFailure(published.errorMessage)
    }
    return createResult(committed.data)
  }

  const run = async <T>(input: JournalWritePlan<T>): Promise<Result<T>> => {
    let reservation: JournalPublicationReservation | undefined
    const committed = await databaseTransactionRun(dependencies.database, async (transaction) => {
      const events: JournalEvent[] = []
      const resources =
        typeof input.resources === "function" ? await input.resources(transaction) : createResult(input.resources)
      if (!resources.success) return resources
      const prepared = await journalRecipientsPrepare(
        transaction,
        resources.data,
        dependencies,
        input.additionalRecipientIds,
      )
      if (!prepared.success) return prepared

      const journal: JournalTransaction = {
        append: async (appendInput) => {
          const parsedInput = v.safeParse(journalEventAppendInputSchema, appendInput)
          if (!parsedInput.success)
            return createResultError("journalWriteCreate", "The journal event input is invalid.")
          const recipientSet = prepared.data.preparedRecipients.get(journalResourceKey(parsedInput.output.resource))
          if (recipientSet === undefined)
            return createResultError(
              "journalWriteCreate",
              "The journal event resource must be prepared before the journal write.",
            )
          const appended = await appendPersist(transaction, parsedInput.output, recipientSet.userIds, true)
          if (appended.success) events.push(...appended.data.events)
          return appended
        },
      }

      if (input.beforeMutation !== undefined) {
        const checked = await input.beforeMutation(transaction)
        if (!checked.success) return checked
      }

      const mutated = input.mutate === undefined ? createResult(undefined as T) : await input.mutate(transaction)
      if (!mutated.success) return mutated

      const written = await input.write(transaction, journal)
      if (!written.success) return written
      if (events.length > 0) reservation = journalPublicationReserve(events)
      return createResult(mutated.data)
    })
    return publicationComplete(committed, reservation)
  }

  return { run }
}
