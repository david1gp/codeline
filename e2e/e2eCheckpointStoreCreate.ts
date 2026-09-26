import { randomUUID } from "node:crypto"
import { open, readFile, readdir, rename, rm, mkdir } from "node:fs/promises"
import { join } from "node:path"
import * as v from "valibot"
import { e2eCheckpointSchema, type E2eCheckpoint } from "./e2eCheckpointSchema.js"

export function e2eCheckpointStoreCreate(directory = "/tmp/opencode/codeline/e2e") {
  const file = (target: E2eCheckpoint["target"]) => join(directory, `${target}.json`)
  const load = async (target: E2eCheckpoint["target"]): Promise<E2eCheckpoint | undefined> => {
    let contents: string
    try {
      contents = await readFile(file(target), "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
    let data: unknown
    try {
      data = JSON.parse(contents) as unknown
    } catch {
      throw new Error(`Invalid E2E checkpoint: ${file(target)}`)
    }
    const parsed = v.safeParse(e2eCheckpointSchema, data)
    if (!parsed.success || parsed.output.target !== target) throw new Error(`Invalid E2E checkpoint: ${file(target)}`)
    return parsed.output
  }
  return {
    load,
    async save(checkpoint: E2eCheckpoint) {
      const parsed = v.parse(e2eCheckpointSchema, checkpoint)
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const temporary = join(directory, `.${parsed.target}.${process.pid}.${randomUUID()}.tmp`)
      const handle = await open(temporary, "wx", 0o600)
      try {
        await handle.writeFile(JSON.stringify(parsed))
        await handle.sync()
      } finally {
        await handle.close()
      }
      try {
        await rename(temporary, file(parsed.target))
      } finally {
        await rm(temporary, { force: true })
      }
    },
    async clear(checkpoint: E2eCheckpoint) {
      const stored = await load(checkpoint.target)
      if (stored?.runId !== checkpoint.runId) throw new Error("E2E checkpoint changed before removal")
      await rm(file(checkpoint.target))
    },
    async lock() {
      await mkdir(directory, { recursive: true, mode: 0o700 })
      const path = join(directory, ".runner.lock")
      let handle: Awaited<ReturnType<typeof open>> | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          handle = await open(path, "wx", 0o600)
          break
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
          // Serialize stale-lock recovery so another contender cannot remove our new lock.
          const recovery = join(directory, ".runner.reclaim")
          try {
            await mkdir(recovery)
          } catch (recoveryError) {
            if ((recoveryError as NodeJS.ErrnoException).code === "EEXIST")
              throw new Error("E2E runner lock recovery is active or interrupted; operator review required")
            throw recoveryError
          }
          try {
            // Never reclaim an unknown lock: its owner may still be writing its PID.
            const contents = await readFile(path, "utf8").catch((readError: NodeJS.ErrnoException) => {
              if (readError.code === "ENOENT") return undefined
              throw readError
            })
            if (contents === undefined) continue
            if (!/^[1-9][0-9]*\n$/.test(contents))
              throw new Error("E2E runner lock has unknown owner; operator review required")
            const pid = Number(contents.trim())
            if (!Number.isSafeInteger(pid))
              throw new Error("E2E runner lock has unknown owner; operator review required")
            try {
              process.kill(pid, 0)
              throw new Error(`E2E runner is already active (PID ${pid})`)
            } catch (probeError) {
              if ((probeError as NodeJS.ErrnoException).code !== "ESRCH") throw probeError
            }
            await rm(path)
          } finally {
            await rm(recovery, { recursive: true })
          }
        }
      }
      if (!handle) throw new Error("E2E runner lock could not be acquired")
      try {
        await handle.writeFile(`${process.pid}\n`)
        await handle.sync()
      } catch (error) {
        await handle.close()
        await rm(path, { force: true })
        throw error
      }
      return async () => {
        await handle.close()
        await rm(path)
      }
    },
    async targets() {
      const entries = await readdir(directory)
      return (["production", "dev"] as const).filter((target) => entries.includes(`${target}.json`))
    },
  }
}
