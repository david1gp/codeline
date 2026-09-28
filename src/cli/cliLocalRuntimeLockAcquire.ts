import { dlopen, FFIType } from "bun:ffi"
import { constants } from "node:fs"
import { open } from "node:fs/promises"
import { join } from "node:path"
import { createResult, createResultError } from "@adaptive-ds/result"

const libc = dlopen("libc.so.6", {
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
})

// OS-owned advisory lock: automatically released on process exit, held across startup reconciliation.
export async function cliLocalRuntimeLockAcquire(dataDirectory: string) {
  const op = "cliLocalRuntimeLockAcquire"
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(
      join(dataDirectory, "db.sqlite.lock"),
      constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    )
    if (!(await handle.stat()).isFile()) {
      await handle.close()
      return createResultError(op, "The local runtime lock is not a regular file.")
    }
    await handle.chmod(0o600)
  } catch {
    if (handle !== undefined) await handle.close()
    return createResultError(op, "The local runtime lock could not be opened.")
  }
  if (handle === undefined) return createResultError(op, "The local runtime lock could not be opened.")
  if (libc.symbols.flock(handle.fd, 2 | 4) !== 0) {
    await handle.close()
    return createResultError(op, "Another local CLI process already owns this database.")
  }
  // Closing the descriptor releases the lock even when shutdown itself reports an error.
  return createResult(async () => {
    try {
      await handle.close()
      return createResult(undefined)
    } catch {
      return createResultError(op, "The local runtime lock could not be released.")
    }
  })
}
