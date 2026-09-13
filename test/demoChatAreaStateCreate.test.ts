import { expect, test } from "bun:test"
import { demoChatAreaStateCreate } from "../src/ui/demo/demoChatAreaStateCreate.js"

test("chat area collapses only after upward conversation movement and preserves its draft", () => {
  const state = demoChatAreaStateCreate()
  state.draftUpdate("Keep this draft while I inspect the timeline")

  state.conversationScroll(200)
  state.conversationScroll(225)
  expect(state.collapsed()).toBe(false)

  state.conversationScroll(216)
  expect(state.collapsed()).toBe(false)
  state.conversationScroll(205)

  expect(state.collapsed()).toBe(true)
  expect(state.draft()).toBe("Keep this draft while I inspect the timeline")

  state.composerExpand()
  expect(state.collapsed()).toBe(false)
  expect(state.draft()).toBe("Keep this draft while I inspect the timeline")
})

test("chat area blurs an active composer when upward movement collapses it", () => {
  const state = demoChatAreaStateCreate()
  let blurCount = 0
  state.composerElementSet({ blur: () => blurCount++ } as unknown as HTMLTextAreaElement)

  state.conversationScroll(200)
  state.conversationScroll(180)

  expect(state.collapsed()).toBe(true)
  expect(blurCount).toBe(1)
})

test("chat area keeps Shift+Enter native and submits with Enter", () => {
  const state = demoChatAreaStateCreate()
  state.draftUpdate("Keyboard-ready draft")
  let prevented = false

  state.keyDownHandle({
    isComposing: false,
    key: "Enter",
    preventDefault: () => {
      prevented = true
    },
    shiftKey: true,
  } as KeyboardEvent)
  expect(prevented).toBe(false)
  expect(state.draft()).toBe("Keyboard-ready draft")

  state.keyDownHandle({
    isComposing: false,
    key: "Enter",
    preventDefault: () => {
      prevented = true
    },
    shiftKey: false,
  } as KeyboardEvent)
  expect(prevented).toBe(true)
  expect(state.draft()).toBe("")
  expect(state.status()).toContain("no request was sent")
})
