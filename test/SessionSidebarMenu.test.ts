import { expect, test } from "bun:test"
import { callEventHandler } from "@corvu/utils/dom"

const source = await Bun.file(new URL("../src/ui/SessionSidebarMenu.tsx", import.meta.url)).text()

test("SessionSidebarMenu stops event propagation without preventing default click behavior", () => {
  expect(source).toContain("event.stopPropagation()")
  expect(source).not.toContain("event.preventDefault()")

  let propagationStopped = false
  let defaultPreventedState = false
  const fakeEvent = {
    get defaultPrevented() {
      return defaultPreventedState
    },
    preventDefault() {
      defaultPreventedState = true
    },
    stopPropagation() {
      propagationStopped = true
    },
    target: {} as Element,
    currentTarget: null,
  } as unknown as Parameters<typeof callEventHandler>[1]

  const clickHandlerMatch = source.match(/onClick=\{\(event\)\s*=>\s*\{([^}]+)\}\}/)
  expect(clickHandlerMatch).not.toBeNull()

  const clickHandler = (event: { stopPropagation: () => void }) => {
    event.stopPropagation()
  }

  const defaultPrevented = callEventHandler(clickHandler, fakeEvent)
  expect(defaultPrevented).toBe(false)
  expect(propagationStopped).toBe(true)
})

test("SessionSidebarMenu renders Rename, Move, and customizable Delete actions", () => {
  expect(source).toContain("<Show when={props.onRename !== undefined}>")
  expect(source).toContain("Rename")
  expect(source).toContain("<Show when={props.onMove !== undefined}>")
  expect(source).toContain("Move")
  expect(source).toContain("<Show when={props.onDelete !== undefined}>")
  expect(source).toContain('{props.deleteLabel ?? "Delete"}')
})
