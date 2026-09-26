import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { finalizedMessageCopyAttempt } from "./finalizedMessageCopyAttempt.js"

type FinalizedMessageCopyStatus = "copied" | "error" | "idle"

type FinalizedMessageCopyStateCreateOptions = {
  content: () => string
  writeText?: (text: string) => Promise<void>
}

export function finalizedMessageCopyStateCreate(options: FinalizedMessageCopyStateCreateOptions) {
  const status = createSignalObject<FinalizedMessageCopyStatus>("idle")

  const copy = async () => {
    status.set("idle")

    const writeText =
      options.writeText ?? globalThis.navigator?.clipboard?.writeText.bind(globalThis.navigator.clipboard)
    status.set(await finalizedMessageCopyAttempt({ content: options.content(), writeText }))
  }

  return { copy, status: status.get }
}
