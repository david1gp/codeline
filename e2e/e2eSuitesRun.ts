import type { E2eCheckpoint } from "./e2eCheckpointSchema.js"
import type { E2eSuite } from "./e2eSuiteSchema.js"
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
  suites: readonly E2eSuite[]
  store: Store
  cleanup(checkpoint: E2eCheckpoint): Promise<void>
  cleanupExpiredServerRuns?(target: E2eCheckpoint["target"], origin: string): Promise<void>
  suiteRun(suite: E2eSuite, checkpoint: E2eCheckpoint): Promise<void>
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
    const manifest = options.suites.map(({ id, steps }) => ({ id, steps: [...steps] }))
    const ids = new Set(manifest.map((suite) => suite.id))
    if (
      manifest.length === 0 ||
      ids.size !== manifest.length ||
      manifest.some(
        (suite) =>
          suite.steps.length === 0 ||
          new Set(suite.steps).size !== suite.steps.length ||
          suite.steps.some((step) => step !== suite.id && !step.startsWith(`${suite.id}/`)),
      )
    )
      throw new Error("Invalid E2E suite manifest")
    current = await options.store.load(options.target)
    if (current !== undefined && current.origin !== options.origin)
      throw new Error("E2E checkpoint target origin mismatch; refuse to resume or discard owned resources")
    if (current === undefined) {
      current = {
        version: 2,
        target: options.target,
        origin: options.origin,
        runId: (options.runIdCreate ?? e2eRunIdCreate)(),
        createdAt: now().toISOString(),
        suiteManifest: manifest,
        completedSuites: [],
        resourceIds: { fixtureRunIds: [] },
      }
      await options.store.save(current)
    }
    if (
      JSON.stringify(current.suiteManifest) !== JSON.stringify(manifest) ||
      new Set(current.completedSuites).size !== current.completedSuites.length ||
      current.completedSuites.some((suite) => !ids.has(suite))
    )
      throw new Error("E2E suite inventory changed; checkpoint requires operator review")
    for (const suite of options.suites) {
      if (current.completedSuites.includes(suite.id)) continue
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
      if (
        JSON.stringify(registered.suiteManifest) !== JSON.stringify(manifest) ||
        JSON.stringify(registered.completedSuites) !== JSON.stringify(current.completedSuites)
      )
        throw new Error("E2E checkpoint suite manifest changed while running a suite")
      current = registered
      if (suiteFailed) throw suiteFailure
      current = { ...current, completedSuites: [...current.completedSuites, suite.id] }
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
