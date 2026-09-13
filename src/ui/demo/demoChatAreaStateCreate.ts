import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"

const messages = [
  {
    detail: "09:41",
    id: "message-1",
    role: "user",
    text: "The session view feels busy once a run gets long. Can you make the active work easier to scan without changing production behavior?",
  },
  {
    detail: "09:42 · analyzed 8 files",
    id: "message-2",
    role: "assistant",
    text: "I’ll keep this isolated to the demo and use the existing surface tokens. First I’m mapping the conversation, composer, and route boundaries so the specimen stays deterministic.",
  },
  {
    detail: "Read · SessionChat.tsx",
    id: "message-3",
    role: "activity",
    text: "Found the production composer and its pending-message states. No production chat files need to change.",
  },
  {
    detail: "09:44",
    id: "message-4",
    role: "assistant",
    text: "The strongest direction is a quiet timeline with one floating input surface. Messages keep generous rhythm, while tool activity becomes a compact bordered row instead of another chat bubble.",
  },
  {
    detail: "09:45",
    id: "message-5",
    role: "user",
    text: "Nice. The composer should get out of the way when I scroll back to inspect earlier work.",
  },
  {
    detail: "Interaction note",
    id: "message-6",
    role: "activity",
    text: "Upward timeline movement collapses the input. The same textarea remains mounted, so its draft and keyboard behavior are preserved.",
  },
  {
    detail: "09:46",
    id: "message-7",
    role: "assistant",
    text: "Implemented the resting treatment: scroll upward and the composer reduces to a single prompt row. Click or focus anywhere in the input to expand it again. Shift+Enter still creates a newline; Enter sends.",
  },
  {
    detail: "09:47 · ready for review",
    id: "message-8",
    role: "assistant",
    text: "I also added enough fixed conversation history to make the gesture testable at every viewport size. The sample never contacts an API and resets cleanly on reload.",
  },
  {
    detail: "09:49",
    id: "message-9",
    role: "user",
    text: "Keep the interaction restrained. I want the transition to feel like the composer is resting, not disappearing.",
  },
  {
    detail: "Style pass",
    id: "message-10",
    role: "activity",
    text: "Matched the project’s surface, line, accent, and shadow tokens. Reduced-motion users keep the same state change without depending on animation.",
  },
  {
    detail: "09:50 · complete",
    id: "message-11",
    role: "assistant",
    text: "The final surface keeps the current draft readable in its resting row and returns the full controls on focus or click. Production chat remains untouched, and the exact demo route is now cataloged.",
  },
] as const

export function demoChatAreaStateCreate() {
  const collapsed = createSignalObject(false)
  const draft = createSignalObject("Add a subtle jump-to-latest control when the reader is away from the end.")
  const status = createSignalObject("Draft saved in this specimen")
  let previousScrollTop: number | undefined
  let upwardDistance = 0
  let composerElement: HTMLTextAreaElement | undefined

  const composerExpand = () => {
    collapsed.set(false)
    upwardDistance = 0
  }

  const submit = () => {
    if (draft.get().trim() === "") return
    status.set("Demo message queued · no request was sent")
    draft.set("")
    composerExpand()
  }

  return {
    collapsed: collapsed.get,
    composerExpand,
    conversationElementSet: (element: HTMLDivElement) => {
      queueMicrotask(() => {
        element.scrollTop = element.scrollHeight
        previousScrollTop = element.scrollTop
      })
    },
    conversationScroll: (scrollTop: number) => {
      if (previousScrollTop === undefined) {
        previousScrollTop = scrollTop
        return
      }

      const delta = scrollTop - previousScrollTop
      previousScrollTop = scrollTop
      if (delta >= 0) {
        upwardDistance = 0
        return
      }

      upwardDistance += Math.abs(delta)
      if (upwardDistance < 18) return
      if (collapsed.get()) return
      collapsed.set(true)
      composerElement?.blur()
    },
    composerElementSet: (element: HTMLTextAreaElement) => {
      composerElement = element
    },
    draft: draft.get,
    draftUpdate: draft.set,
    keyDownHandle: (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
      event.preventDefault()
      submit()
    },
    messages,
    status: status.get,
    submitHandle: (event: SubmitEvent) => {
      event.preventDefault()
      submit()
    },
  }
}
