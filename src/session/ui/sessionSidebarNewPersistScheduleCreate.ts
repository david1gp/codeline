type ScheduleOptions = {
  delaySchedule: (callback: () => void) => ReturnType<typeof setTimeout>
  delayCancel: (timer: ReturnType<typeof setTimeout>) => void
  idleSchedule?: (callback: () => void) => number
  idleCancel?: (handle: number) => void
}

export function sessionSidebarNewPersistScheduleCreate(
  options: ScheduleOptions = {
    delaySchedule: (callback) => setTimeout(callback, 180),
    delayCancel: clearTimeout,
    idleSchedule: typeof requestIdleCallback === "function" ? requestIdleCallback : undefined,
    idleCancel: typeof cancelIdleCallback === "function" ? cancelIdleCallback : undefined,
  },
) {
  let delay: ReturnType<typeof setTimeout> | undefined
  let idle: number | undefined
  let pending: (() => void) | undefined
  const schedule = (write: () => void) => {
    pending = write
    if (delay !== undefined) options.delayCancel(delay)
    if (idle !== undefined) options.idleCancel?.(idle)
    delay = options.delaySchedule(() => {
      if (pending !== write) return
      if (options.idleSchedule === undefined) {
        pending = undefined
        write()
        return
      }
      idle = options.idleSchedule(() => {
        if (pending !== write) return
        pending = undefined
        idle = undefined
        write()
      })
    })
  }
  const flush = () => {
    if (delay !== undefined) options.delayCancel(delay)
    if (idle !== undefined) options.idleCancel?.(idle)
    delay = undefined
    idle = undefined
    const write = pending
    pending = undefined
    write?.()
  }
  return { schedule, flush }
}
