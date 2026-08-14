import { finalizedMessageCopyStateCreate } from "../../message/ui/finalizedMessageCopyStateCreate.js"
import { demoFinalizedMessageFixture } from "./demoFinalizedMessageFixture.js"
import type { DemoSessionScreenVariant } from "./demoSessionScreenVariant.js"

export function demoFinalizedMessageStateCreate(variant: () => DemoSessionScreenVariant) {
  const copyStates = new Map<number, ReturnType<typeof finalizedMessageCopyStateCreate>>()

  return () =>
    demoFinalizedMessageFixture(variant()).map((message, index) => ({
      ...message,
      copyState: copyStates.get(index) ?? copyStateCreate(copyStates, index, message.content),
    }))
}

function copyStateCreate(
  states: Map<number, ReturnType<typeof finalizedMessageCopyStateCreate>>,
  index: number,
  content: string,
) {
  const state = finalizedMessageCopyStateCreate({ content: () => content, writeText: async () => undefined })
  states.set(index, state)
  return state
}
