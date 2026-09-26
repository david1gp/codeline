import type { DatabaseClient } from "../../database/databaseClient.js"
import type { metricsCollectorCreate } from "../../metrics/metricsCollectorCreate.js"
import type { JournalEventsPruneLimits } from "../schema/journalEventsPruneLimitsSchema.js"
import { journalEventsPrune } from "./journalEventsPrune.js"
import { journalEventsPruneDefaultLimits } from "./journalEventsPruneDefaultLimits.js"

type JournalEventsPruneSchedulerCreateDependencies = {
  clearTimeout?: (handle: unknown) => void
  clock?: () => Date
  cooldownMs?: number
  database: DatabaseClient
  limits?: JournalEventsPruneLimits
  logError?: (message: string) => void
  metricsCollector?: ReturnType<typeof metricsCollectorCreate>
  prune?: typeof journalEventsPrune
  setTimeout?: (handler: () => void, timeoutMs: number) => unknown
}

type JournalEventsPruneSchedulerState = {
  deferredTimer: { dueAt: number; handle: unknown } | undefined
  lastStartedAt: number | undefined
  lastUsedAt: number
  pending: boolean
  running: Promise<void> | undefined
  userId: string
}

const journalEventsPruneSchedulerDefaultCooldownMs = 250
const journalEventsPruneSchedulerMaxTrackedUsers = 4_096

function journalEventsPruneSchedulerNow(clock: () => Date): number | undefined {
  try {
    const now = clock()
    if (!(now instanceof Date)) return undefined
    const milliseconds = now.getTime()
    return Number.isFinite(milliseconds) ? milliseconds : undefined
  } catch (_error) {
    return undefined
  }
}

function journalEventsPruneSchedulerMetricIncrement(
  metricsCollector: ReturnType<typeof metricsCollectorCreate> | undefined,
  name: string,
  value = 1,
  labels: Readonly<Record<string, string>> = {},
): void {
  try {
    metricsCollector?.increment(name, value, labels)
  } catch (_error) {
    // Metrics must not change the outcome of maintenance or the committed write.
  }
}

export function journalEventsPruneSchedulerCreate(dependencies: JournalEventsPruneSchedulerCreateDependencies) {
  const clock = dependencies.clock ?? (() => new Date())
  const clearTimeout =
    dependencies.clearTimeout ??
    ((handle: unknown) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>))
  const limits = dependencies.limits ?? journalEventsPruneDefaultLimits
  const prune = dependencies.prune ?? journalEventsPrune
  const setTimeout =
    dependencies.setTimeout ?? ((handler: () => void, timeoutMs: number) => globalThis.setTimeout(handler, timeoutMs))
  const metricsCollector = dependencies.metricsCollector
  const cooldownMs =
    dependencies.cooldownMs !== undefined &&
    Number.isSafeInteger(dependencies.cooldownMs) &&
    dependencies.cooldownMs >= 0
      ? dependencies.cooldownMs
      : journalEventsPruneSchedulerDefaultCooldownMs
  const statesByUserId = new Map<string, JournalEventsPruneSchedulerState>()

  const logError = (message: string): void => {
    try {
      const logger = dependencies.logError ?? ((errorMessage: string) => console.error(errorMessage))
      logger(message)
    } catch (_error) {
      // Logging must not change the outcome of maintenance or the committed write.
    }
  }

  const failure = (message: string): void => {
    journalEventsPruneSchedulerMetricIncrement(metricsCollector, "journal_events_prune_total", 1, {
      outcome: "failure",
    })
    logError(message)
  }

  let acceptingSchedules = true
  let drainPromise: Promise<void> | undefined

  const stateTimerClear = (state: JournalEventsPruneSchedulerState): void => {
    const timer = state.deferredTimer
    if (timer === undefined) return
    state.deferredTimer = undefined
    try {
      clearTimeout(timer.handle)
    } catch (_error) {
      // Timer cleanup must not change the outcome of maintenance or shutdown.
    }
  }

  const stateCooldownElapsed = (state: JournalEventsPruneSchedulerState, now: number): boolean => {
    if (state.lastStartedAt === undefined) return true
    return now >= state.lastStartedAt + cooldownMs
  }

  const stateDeleteIfIdle = (state: JournalEventsPruneSchedulerState, now: number | undefined, force = false): void => {
    if (state.running !== undefined || state.pending || state.deferredTimer !== undefined) return
    if (!force && (now === undefined || !stateCooldownElapsed(state, now))) return
    if (statesByUserId.get(state.userId) === state) statesByUserId.delete(state.userId)
  }

  const stateCleanup = (now: number): void => {
    for (const state of statesByUserId.values()) {
      if (state.running !== undefined || state.pending) continue
      if (state.deferredTimer !== undefined && !stateCooldownElapsed(state, now)) continue
      stateTimerClear(state)
      stateDeleteIfIdle(state, now)
    }
  }

  const stateEvict = (now: number): void => {
    if (statesByUserId.size < journalEventsPruneSchedulerMaxTrackedUsers) return
    let oldest: JournalEventsPruneSchedulerState | undefined
    for (const state of statesByUserId.values()) {
      if (state.running !== undefined || state.pending) continue
      if (!stateCooldownElapsed(state, now)) continue
      if (oldest === undefined || state.lastUsedAt < oldest.lastUsedAt) oldest = state
    }
    if (oldest === undefined) return
    stateTimerClear(oldest)
    statesByUserId.delete(oldest.userId)
  }

  const stateGet = (userId: string, now: number): JournalEventsPruneSchedulerState | undefined => {
    const existing = statesByUserId.get(userId)
    if (existing !== undefined) {
      existing.lastUsedAt = now
      return existing
    }
    stateEvict(now)
    if (statesByUserId.size >= journalEventsPruneSchedulerMaxTrackedUsers) return undefined
    const state: JournalEventsPruneSchedulerState = {
      lastStartedAt: undefined,
      lastUsedAt: now,
      pending: false,
      running: undefined,
      deferredTimer: undefined,
      userId,
    }
    statesByUserId.set(userId, state)
    return state
  }

  const deferredTimerSchedule = (state: JournalEventsPruneSchedulerState, dueAt: number, now: number): void => {
    if (state.deferredTimer?.dueAt === dueAt) return
    stateTimerClear(state)
    const timer = { dueAt, handle: undefined as unknown }
    state.deferredTimer = timer
    try {
      timer.handle = setTimeout(
        () => {
          if (state.deferredTimer !== timer) return
          state.deferredTimer = undefined
          const current = journalEventsPruneSchedulerNow(clock)
          if (current === undefined) {
            if (state.pending) state.pending = false
            failure("The journal event pruning clock failed.")
            stateDeleteIfIdle(state, undefined)
            return
          }
          if (state.running !== undefined) return
          if (state.pending) {
            if (acceptingSchedules && !stateCooldownElapsed(state, current)) {
              deferredTimerSchedule(state, state.lastStartedAt! + cooldownMs, current)
              return
            }
            state.pending = false
            start(state, current)
            return
          }
          if (!stateCooldownElapsed(state, current)) {
            deferredTimerSchedule(state, state.lastStartedAt! + cooldownMs, current)
            return
          }
          stateDeleteIfIdle(state, current)
        },
        Math.max(0, dueAt - now),
      )
    } catch (_error) {
      state.deferredTimer = undefined
      failure("The journal event pruning timer could not be scheduled.")
    }
  }

  const cooldownSchedule = (state: JournalEventsPruneSchedulerState, now: number): void => {
    if (state.lastStartedAt === undefined) return
    const dueAt = state.lastStartedAt + cooldownMs
    if (stateCooldownElapsed(state, now)) {
      stateTimerClear(state)
      stateDeleteIfIdle(state, now)
      return
    }
    deferredTimerSchedule(state, dueAt, now)
  }

  const start = (state: JournalEventsPruneSchedulerState, startedAt: number): void => {
    stateTimerClear(state)
    state.lastStartedAt = startedAt
    state.lastUsedAt = startedAt
    journalEventsPruneSchedulerMetricIncrement(metricsCollector, "journal_events_prune_total", 1, {
      outcome: "started",
    })
    const operation = Promise.resolve().then(() =>
      prune(
        {
          clock,
          database: dependencies.database,
          limits,
        },
        { userId: state.userId },
      ),
    )
    const settled = operation
      .then((result) => {
        if (!result.success) {
          failure(`Journal event pruning failed for user ${state.userId}: ${result.errorMessage}`)
          return
        }
        journalEventsPruneSchedulerMetricIncrement(metricsCollector, "journal_events_prune_total", 1, {
          outcome: "success",
        })
        journalEventsPruneSchedulerMetricIncrement(
          metricsCollector,
          "journal_events_prune_events_total",
          result.data.prunedEventCount,
        )
        journalEventsPruneSchedulerMetricIncrement(
          metricsCollector,
          "journal_events_prune_bytes_total",
          result.data.prunedSerializedBytes,
        )
      })
      .catch((_error) => {
        failure(`The journal event pruning operation failed for user ${state.userId}.`)
      })
      .then(() => {
        state.running = undefined
        const now = journalEventsPruneSchedulerNow(clock)
        if (now === undefined) {
          if (state.pending) {
            state.pending = false
            failure("The journal event pruning clock failed.")
          }
          return
        }
        if (!state.pending) {
          if (drainPromise !== undefined) stateDeleteIfIdle(state, now, true)
          else cooldownSchedule(state, now)
          return
        }
        if (!acceptingSchedules || stateCooldownElapsed(state, now)) {
          state.pending = false
          start(state, now)
          return
        }
        cooldownSchedule(state, now)
      })
    state.running = settled
  }

  const schedule = (userIds: readonly string[]): void => {
    if (!acceptingSchedules) {
      journalEventsPruneSchedulerMetricIncrement(
        metricsCollector,
        "journal_events_prune_schedule_total",
        userIds.length,
        {
          outcome: "closed",
        },
      )
      return
    }
    const now = journalEventsPruneSchedulerNow(clock)
    if (now === undefined) {
      failure("The journal event pruning clock failed.")
      return
    }
    stateCleanup(now)
    const uniqueUserIds = [...new Set(userIds)].sort((left, right) => left.localeCompare(right))
    for (const userId of uniqueUserIds) {
      const state = stateGet(userId, now)
      if (state === undefined) {
        journalEventsPruneSchedulerMetricIncrement(metricsCollector, "journal_events_prune_schedule_total", 1, {
          outcome: "dropped",
        })
        continue
      }
      state.pending = true
      if (state.running !== undefined) {
        if (state.lastStartedAt !== undefined) cooldownSchedule(state, now)
        journalEventsPruneSchedulerMetricIncrement(metricsCollector, "journal_events_prune_coalesced_total")
        continue
      }
      if (state.lastStartedAt !== undefined && !stateCooldownElapsed(state, now)) {
        cooldownSchedule(state, now)
        journalEventsPruneSchedulerMetricIncrement(metricsCollector, "journal_events_prune_coalesced_total")
        continue
      }
      state.pending = false
      start(state, now)
    }
  }

  const flush = async (): Promise<void> => {
    while (true) {
      const running = [...statesByUserId.values()]
        .map((state) => state.running)
        .filter((operation): operation is Promise<void> => operation !== undefined)
      if (running.length === 0) return
      await Promise.all(running)
    }
  }

  const drain = (): Promise<void> => {
    if (drainPromise !== undefined) return drainPromise
    acceptingSchedules = false
    const now = journalEventsPruneSchedulerNow(clock)
    for (const state of statesByUserId.values()) {
      stateTimerClear(state)
      if (state.pending && state.running === undefined) {
        if (now === undefined) {
          state.pending = false
          failure("The journal event pruning clock failed.")
          continue
        }
        state.pending = false
        start(state, now)
      }
    }
    drainPromise = flush().then(() => {
      for (const state of statesByUserId.values()) {
        stateTimerClear(state)
        state.pending = false
        stateDeleteIfIdle(state, undefined, true)
      }
    })
    return drainPromise
  }

  const trackedUserCount = (): number => statesByUserId.size

  return { drain, flush, schedule, trackedUserCount }
}
