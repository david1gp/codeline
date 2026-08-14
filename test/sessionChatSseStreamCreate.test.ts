import { expect, test } from "bun:test"
import { EventType } from "@tanstack/ai"
import { sessionChatSseStreamCreate } from "../src/session/actions/sessionChatSseStreamCreate.js"

test("detached SSE delivery keeps draining the source after its reader is cancelled", async () => {
  let consumed = 0
  let completedResolve: () => void = () => undefined
  const completed = new Promise<void>((resolve) => {
    completedResolve = resolve
  })
  const source = (async function* () {
    for (const value of ["first", "second", "third"]) {
      consumed += 1
      yield { delta: value, type: EventType.TEXT_MESSAGE_CONTENT } as never
      await Promise.resolve()
    }
    completedResolve()
  })()

  const body = sessionChatSseStreamCreate(source)
  const reader = body.getReader()
  await reader.read()
  await reader.cancel()
  await completed

  expect(consumed).toBe(3)
})
