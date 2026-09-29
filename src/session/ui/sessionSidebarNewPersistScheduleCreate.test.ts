import { expect, test } from "bun:test"
import { sessionSidebarNewPersistScheduleCreate } from "./sessionSidebarNewPersistScheduleCreate.js"

test("sidebar persistence flushes pending writes before and after idle scheduling", () => {
  const delayed: (() => void)[] = []
  const idle: (() => void)[] = []
  const writes: string[] = []
  const schedule = sessionSidebarNewPersistScheduleCreate({
    delaySchedule: (callback) => {
      delayed.push(callback)
      return delayed.length as unknown as ReturnType<typeof setTimeout>
    },
    delayCancel: () => {},
    idleSchedule: (callback) => {
      idle.push(callback)
      return idle.length
    },
    idleCancel: () => {},
  })

  schedule.schedule(() => writes.push("latest"))
  delayed[0]?.()
  schedule.flush()
  expect(writes).toEqual(["latest"])
  delayed[0]?.()
  idle[0]?.()
  expect(writes).toEqual(["latest"])

  schedule.schedule(() => writes.push("rescheduled"))
  schedule.flush()
  expect(writes).toEqual(["latest", "rescheduled"])
})
