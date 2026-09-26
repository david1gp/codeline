import type { E2eCheckpoint } from "./e2eCheckpointSchema.js"
import { e2eRunIdCreate } from "./e2eRunIdCreate.js"

type Store = {
  load(target: E2eCheckpoint["target"]): Promise<E2eCheckpoint | undefined>
  save(checkpoint: E2eCheckpoint): Promise<void>
  clear(checkpoint: E2eCheckpoint): Promise<void>
  lock(): Promise<() => Promise<void>>
  targets(): Promise<readonly E2eCheckpoint["target"][]>
}

/** Dependencies are narrow so no runner path can directly delete application data. */
export async function e2eSuitesRun(options: {
  target: E2eCheckpoint["target"]
  origin: string
  suites: readonly string[]
  store: Store
  cleanup(checkpoint: E2eCheckpoint): Promise<void>
  cleanupExpiredServerRuns?(target: E2eCheckpoint["target"], origin: string): Promise<void>
  suiteRun(suite: string, checkpoint: E2eCheckpoint): Promise<void>
  now?: () => Date
  runIdCreate?: () => string
}): Promise<void> {
  const release = await options.store.lock()
  const now = options.now ?? (() => new Date())
  const expired = (checkpoint: E2eCheckpoint) =>
    now().getTime() - Date.parse(checkpoint.createdAt) > 24 * 60 * 60 * 1000
  let current: E2eCheckpoint | undefined
  let success = false
  let failure: unknown
  const clean = async (checkpoint: E2eCheckpoint) => {
    await options.cleanup(checkpoint)
    await options.store.clear(checkpoint)
  }
  try {
    // Old runs are removed before any new run. A failed cleanup keeps its checkpoint for retry.
    for (const target of await options.store.targets()) {
      const checkpoint = await options.store.load(target)
      if (checkpoint !== undefined && expired(checkpoint)) await clean(checkpoint)
    }
    if (options.cleanupExpiredServerRuns) await options.cleanupExpiredServerRuns(options.target, options.origin)
    current = await options.store.load(options.target)
    if (current !== undefined && current.origin !== options.origin)
      throw new Error("E2E checkpoint target origin mismatch; refuse to resume or discard owned resources")
    if (current === undefined) {
      current = {
        version: 1,
        target: options.target,
        origin: options.origin,
        runId: (options.runIdCreate ?? e2eRunIdCreate)(),
        createdAt: now().toISOString(),
        completedSuites: [],
        resourceIds: { fixtureRunIds: [] },
      }
      await options.store.save(current)
    }
    const suites = new Set(options.suites)
    if (suites.size !== options.suites.length || current.completedSuites.some((suite) => !suites.has(suite)))
      throw new Error("E2E suite inventory changed; checkpoint requires operator review")
    for (const suite of options.suites) {
      if (current.completedSuites.includes(suite)) continue
      let suiteFailed = false
      let suiteFailure: unknown
      try {
        await options.suiteRun(suite, current)
      } catch (error) {
        suiteFailed = true
        suiteFailure = error
      }
      // The child registers fixtures on disk, including when the suite fails.
      const registered = await options.store.load(options.target)
      if (registered?.runId !== current.runId || registered.origin !== current.origin)
        throw new Error("E2E checkpoint changed while running a suite")
      current = registered
      if (suiteFailed) throw suiteFailure
      current = { ...current, completedSuites: [...current.completedSuites, suite] }
      await options.store.save(current)
    }
    success = true
  } catch (error) {
    failure = error
  } finally {
    try {
      if (success && current !== undefined) {
        try {
          await clean(current)
        } catch (error) {
          console.error("E2E current-run cleanup failed; checkpoint retained:", error)
          failure ??= error
        }
      }
      // Retry expired cleanup even when a suite, inventory check, or fresh-run setup failed.
      for (const target of await options.store.targets()) {
        try {
          const checkpoint = await options.store.load(target)
          if (checkpoint !== undefined && expired(checkpoint) && checkpoint.runId !== current?.runId)
            await clean(checkpoint)
        } catch (error) {
          console.error(`E2E expired ${target} cleanup failed; checkpoint retained:`, error)
          failure ??= error
        }
      }
    } catch (error) {
      console.error("E2E cleanup scan failed; checkpoint retained:", error)
      failure ??= error
    } finally {
      if (options.cleanupExpiredServerRuns) {
        try {
          await options.cleanupExpiredServerRuns(options.target, options.origin)
        } catch (error) {
          console.error("E2E expired server-run cleanup failed:", error)
          failure ??= error
        }
      }
      await release()
    }
  }
  if (failure !== undefined) throw failure
}
