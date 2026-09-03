import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { IDBPDatabase, IDBPTransaction } from "idb"
import { type SessionCacheLimits, sessionCacheDatabaseConfig } from "./sessionCacheDatabaseConfig.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheStorageFailureDescribe } from "./sessionCacheStorageFailureDescribe.js"

const sessionCacheStoreNames = [
  "sessionSnapshots",
  "historyEntries",
  "historyPages",
  "runDetails",
  "toolDetails",
] as const

type SessionCacheWriteTransaction = IDBPTransaction<
  SessionCacheDatabaseSchema,
  ["sessionSnapshots", "historyEntries", "historyPages", "runDetails", "toolDetails"],
  "readwrite"
>

type SessionCacheTarget = { sessionId: string; userId: string }
type SessionCacheEvictionCandidate = SessionCacheTarget & { storedAt: number }

async function sessionCacheSessionDelete(transaction: SessionCacheWriteTransaction, target: SessionCacheTarget) {
  await transaction.objectStore("sessionSnapshots").delete([target.userId, target.sessionId])
  const sessionKey = IDBKeyRange.only([target.userId, target.sessionId])
  for (const storeName of ["historyEntries", "historyPages", "runDetails", "toolDetails"] as const) {
    const store = transaction.objectStore(storeName)
    const keys = await store.index("by-session").getAllKeys(sessionKey)
    for (const key of keys) await store.delete(key as never)
  }
}

async function sessionCacheAccountByteSize(transaction: SessionCacheWriteTransaction, userId: string): Promise<number> {
  let byteSize = 0
  for (const storeName of sessionCacheStoreNames) {
    const records = await transaction.objectStore(storeName).getAll()
    for (const record of records) {
      if (record.userId === userId) byteSize += record.byteSize
    }
  }
  return byteSize
}

async function sessionCacheHistoryBoundsEnforce(
  transaction: SessionCacheWriteTransaction,
  target: SessionCacheTarget,
  limits: SessionCacheLimits,
) {
  const snapshots = transaction.objectStore("sessionSnapshots")
  const snapshot = await snapshots.get([target.userId, target.sessionId])
  const protectedEntryIds = new Set(snapshot?.entryIds ?? [])
  const entriesStore = transaction.objectStore("historyEntries")
  const entries = await entriesStore.index("by-session").getAll([target.userId, target.sessionId])
  const excessEntryCount = entries.length - limits.maxHistoryEntriesPerSession
  if (excessEntryCount <= 0) return

  const candidates = entries
    .filter((entry) => !protectedEntryIds.has(entry.entryId))
    .sort((first, second) => {
      const storedAtOrder = first.storedAt - second.storedAt
      if (storedAtOrder !== 0) return storedAtOrder
      const positionOrder = first.position - second.position
      if (positionOrder !== 0) return positionOrder
      return first.entryId.localeCompare(second.entryId)
    })
  if (candidates.length < excessEntryCount) {
    throw new DOMException("The session cache quota cannot retain the authoritative snapshot.", "QuotaExceededError")
  }

  const evictedEntryIds = new Set(candidates.slice(0, excessEntryCount).map((entry) => entry.entryId))
  for (const entryId of evictedEntryIds) await entriesStore.delete([target.userId, target.sessionId, entryId])

  const pagesStore = transaction.objectStore("historyPages")
  const pages = await pagesStore.index("by-session").getAll([target.userId, target.sessionId])
  for (const page of pages) {
    if (page.entryIds.some((entryId) => evictedEntryIds.has(entryId))) {
      await pagesStore.delete([target.userId, target.sessionId, page.requestCursor])
    }
  }
}

async function sessionCacheDetailBoundsEnforce(
  transaction: SessionCacheWriteTransaction,
  target: SessionCacheTarget,
  limits: SessionCacheLimits,
) {
  const key = IDBKeyRange.only([target.userId, target.sessionId])
  const runStore = transaction.objectStore("runDetails")
  const toolStore = transaction.objectStore("toolDetails")
  const runs = await runStore.index("by-session").getAll(key)
  const tools = await toolStore.index("by-session").getAll(key)
  const excessDetailCount = runs.length + tools.length - limits.maxDetailsPerSession
  if (excessDetailCount <= 0) return

  const candidates = [
    ...runs.map((record) => ({ id: record.runId, kind: "run" as const, record })),
    ...tools.map((record) => ({ id: `${record.runId}:${record.detailId}`, kind: "tool" as const, record })),
  ].sort((first, second) => {
    const storedAtOrder = first.record.storedAt - second.record.storedAt
    if (storedAtOrder !== 0) return storedAtOrder
    const kindOrder = first.kind.localeCompare(second.kind)
    if (kindOrder !== 0) return kindOrder
    return first.id.localeCompare(second.id)
  })

  for (const candidate of candidates.slice(0, excessDetailCount)) {
    if (candidate.kind === "run") {
      await runStore.delete([target.userId, target.sessionId, candidate.record.runId])
      continue
    }
    await toolStore.delete([target.userId, target.sessionId, candidate.record.runId, candidate.record.detailId])
  }
}

async function sessionCacheAccountBoundsEnforce(
  transaction: SessionCacheWriteTransaction,
  target: SessionCacheTarget,
  limits: SessionCacheLimits,
) {
  const snapshotStore = transaction.objectStore("sessionSnapshots")
  const targets = new Map<string, SessionCacheTarget & { storedAt: number }>()
  const targetAdd = (candidate: SessionCacheTarget & { storedAt: number }) => {
    const key = `${candidate.userId}\u0000${candidate.sessionId}`
    const existing = targets.get(key)
    if (existing === undefined || candidate.storedAt > existing.storedAt) targets.set(key, candidate)
  }
  for (const snapshot of await snapshotStore.getAll()) targetAdd(snapshot)
  for (const storeName of ["historyEntries", "historyPages", "runDetails", "toolDetails"] as const) {
    for (const record of await transaction.objectStore(storeName).getAll()) targetAdd(record)
  }

  let cachedTargets = [...targets.values()]
  const accountIds = [...new Set(cachedTargets.map((candidate) => candidate.userId))]
  if (accountIds.length > limits.maxAccounts) {
    const accountCandidates = accountIds
      .filter((userId) => userId !== target.userId)
      .map((userId) => ({
        storedAt: Math.max(
          ...cachedTargets.filter((candidate) => candidate.userId === userId).map((candidate) => candidate.storedAt),
        ),
        userId,
      }))
      .sort((first, second) => first.storedAt - second.storedAt || first.userId.localeCompare(second.userId))
    for (const account of accountCandidates.slice(0, accountIds.length - limits.maxAccounts)) {
      const accountSessions = cachedTargets.filter((candidate) => candidate.userId === account.userId)
      for (const session of accountSessions) await sessionCacheSessionDelete(transaction, session)
    }
    const evictedAccounts = new Set(
      accountCandidates.slice(0, accountIds.length - limits.maxAccounts).map((item) => item.userId),
    )
    cachedTargets = [...targets.values()].filter((candidate) => !evictedAccounts.has(candidate.userId))
  }

  const ownSessions = cachedTargets
    .filter((candidate) => candidate.userId === target.userId)
    .sort((first, second) => first.storedAt - second.storedAt || first.sessionId.localeCompare(second.sessionId))
  const excessSessionCount = ownSessions.length - limits.maxSessionsPerAccount
  if (excessSessionCount > 0) {
    const candidates = ownSessions.filter((candidate) => candidate.sessionId !== target.sessionId)
    if (candidates.length < excessSessionCount) {
      throw new DOMException("The session cache account limit is invalid.", "QuotaExceededError")
    }
    for (const candidate of candidates.slice(0, excessSessionCount))
      await sessionCacheSessionDelete(transaction, candidate)
  }

  let accountBytes = await sessionCacheAccountByteSize(transaction, target.userId)
  if (accountBytes <= limits.maxAccountBytes) return

  const byteCandidates = cachedTargets
    .filter((candidate) => candidate.userId === target.userId && candidate.sessionId !== target.sessionId)
    .sort((first, second) => first.storedAt - second.storedAt || first.sessionId.localeCompare(second.sessionId))
  for (const candidate of byteCandidates) {
    await sessionCacheSessionDelete(transaction, candidate)
    accountBytes = await sessionCacheAccountByteSize(transaction, target.userId)
    if (accountBytes <= limits.maxAccountBytes) return
  }

  throw new DOMException("The session cache account byte quota was exceeded.", "QuotaExceededError")
}

async function sessionCacheWriteAttempt(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  target: SessionCacheTarget,
  limits: SessionCacheLimits,
  forcedEvictions: readonly SessionCacheTarget[],
  write: (transaction: SessionCacheWriteTransaction) => Promise<void>,
) {
  let transaction: SessionCacheWriteTransaction | undefined
  try {
    transaction = database.transaction(sessionCacheStoreNames, "readwrite")
    for (const eviction of forcedEvictions) await sessionCacheSessionDelete(transaction, eviction)
    await write(transaction)
    await sessionCacheHistoryBoundsEnforce(transaction, target, limits)
    await sessionCacheDetailBoundsEnforce(transaction, target, limits)
    await sessionCacheAccountBoundsEnforce(transaction, target, limits)
    await transaction.done
    return { success: true as const }
  } catch (error) {
    try {
      transaction?.abort()
    } catch {
      // The request may already have aborted the transaction.
    }
    await transaction?.done.catch(() => undefined)
    return { failure: sessionCacheStorageFailureDescribe(error), success: false as const }
  }
}

async function sessionCacheEvictionCandidatesRead(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  target: SessionCacheTarget,
): Promise<SessionCacheEvictionCandidate[]> {
  const transaction = database.transaction(sessionCacheStoreNames, "readonly")
  const targets = new Map<string, SessionCacheEvictionCandidate>()
  const targetAdd = (candidate: SessionCacheEvictionCandidate) => {
    const key = `${candidate.userId}\u0000${candidate.sessionId}`
    const existing = targets.get(key)
    if (existing === undefined || candidate.storedAt > existing.storedAt) targets.set(key, candidate)
  }
  for (const storeName of sessionCacheStoreNames) {
    for (const record of await transaction.objectStore(storeName).getAll()) targetAdd(record)
  }
  await transaction.done
  return [...targets.values()]
    .filter((candidate) => candidate.userId !== target.userId || candidate.sessionId !== target.sessionId)
    .sort((first, second) => {
      const accountOrder = Number(first.userId !== target.userId) - Number(second.userId !== target.userId)
      if (accountOrder !== 0) return accountOrder
      const storedAtOrder = first.storedAt - second.storedAt
      if (storedAtOrder !== 0) return storedAtOrder
      const userOrder = first.userId.localeCompare(second.userId)
      if (userOrder !== 0) return userOrder
      return first.sessionId.localeCompare(second.sessionId)
    })
}

export async function sessionCacheWrite(
  database: IDBPDatabase<SessionCacheDatabaseSchema>,
  target: SessionCacheTarget,
  write: (transaction: SessionCacheWriteTransaction) => Promise<void>,
  limits: SessionCacheLimits = sessionCacheDatabaseConfig.limits,
): Promise<Result<void>> {
  const op = "sessionCacheWrite"
  if (Object.values(limits).some((limit) => !Number.isSafeInteger(limit) || limit < 1)) {
    return createResultError(op, "The session cache limits are invalid.")
  }

  const firstAttempt = await sessionCacheWriteAttempt(database, target, limits, [], write)
  if (firstAttempt.success) return createResult(undefined)
  if (firstAttempt.failure.kind !== "quota") {
    if (firstAttempt.failure.kind === "schema")
      return createResultError(op, "The session cache database schema is invalid.")
    return createResultError(op, "The session cache database transaction failed.")
  }

  let candidates: SessionCacheEvictionCandidate[]
  try {
    candidates = await sessionCacheEvictionCandidatesRead(database, target)
  } catch {
    return createResultError(op, "The session cache database transaction failed.")
  }
  for (let count = 1; count <= candidates.length; count += 1) {
    const attempt = await sessionCacheWriteAttempt(database, target, limits, candidates.slice(0, count), write)
    if (attempt.success) return createResult(undefined)
    if (attempt.failure.kind !== "quota") {
      return createResultError(op, "The session cache database transaction failed.")
    }
  }

  return createResultError(op, "The session cache storage quota was exceeded.")
}
