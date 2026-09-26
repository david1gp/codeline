import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { E2eCheckpoint } from "./e2eCheckpointSchema.js"

/** Operator-requested teardown of one checkpoint; never discovers or adopts other runs. */
export async function e2eCheckpointRecover(options: {
  runId: string
  target: E2eCheckpoint["target"]
  origin: string
  store: {
    load(target: E2eCheckpoint["target"]): Promise<E2eCheckpoint | undefined>
    clear(checkpoint: E2eCheckpoint): Promise<void>
    lock(): Promise<() => Promise<void>>
  }
  cleanup(checkpoint: E2eCheckpoint): Promise<void>
}): Promise<Result<readonly string[]>> {
  const op = "e2eCheckpointRecover"
  if (!/^e2e[0-9a-z]{3,37}$/.test(options.runId)) return createResultError(op, "An explicit E2E run ID is required")
  let release: () => Promise<void>
  try {
    release = await options.store.lock()
  } catch (error) {
    return createResultError(
      op,
      `Could not lock the E2E checkpoint: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  try {
    const checkpoint = await options.store.load(options.target)
    if (
      checkpoint?.runId !== options.runId ||
      checkpoint.target !== options.target ||
      checkpoint.origin !== options.origin
    )
      return createResultError(op, "Checkpoint run or target mismatch; refusing recovery")
    await options.cleanup(checkpoint)
    const stored = await options.store.load(options.target)
    if (JSON.stringify(stored) !== JSON.stringify(checkpoint))
      return createResultError(op, "Checkpoint changed during recovery; refusing to clear it")
    await options.store.clear(checkpoint)
    return createResult(checkpoint.resourceIds.fixtureRunIds)
  } catch (error) {
    return createResultError(
      op,
      `E2E checkpoint cleanup or verification failed; checkpoint retained: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    await release()
  }
}
