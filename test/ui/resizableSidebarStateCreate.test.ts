import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { resizableSidebarStateCreate } from "../../src/ui/resizableSidebarStateCreate.js"

function viewportCreate(innerWidth: number) {
  const listeners = new Set<() => void>()
  return {
    addEventListener: (_type: string, listener: () => void) => void listeners.add(listener),
    dispatchResize: () => listeners.forEach((listener) => listener()),
    innerWidth,
    listenerCount: () => listeners.size,
    removeEventListener: (_type: string, listener: () => void) => void listeners.delete(listener),
  }
}

function pointerEventCreate(target: HTMLElement, clientX: number, pointerId = 1) {
  return {
    button: 0,
    clientX,
    currentTarget: target,
    pointerId,
    pointerType: "mouse",
    preventDefault: () => undefined,
  } as unknown as PointerEvent
}

test("resizable sidebar supports pointer and keyboard resizing within desktop bounds", () => {
  const viewport = viewportCreate(1200)
  const documentState = { body: { style: { cursor: "default", userSelect: "text" } } }
  const target = { setPointerCapture: () => undefined } as unknown as HTMLElement
  const root = createRoot((dispose) => ({
    dispose,
    state: resizableSidebarStateCreate({
      defaultWidth: 240,
      document: documentState as unknown as Document,
      maximumWidth: 360,
      minimumWidth: 184,
      storageKey: "test-sidebar-width",
      viewportEventTarget: viewport as unknown as Window,
    }),
  }))

  root.state.resizeStart(pointerEventCreate(target, 240))
  root.state.resizeMove(pointerEventCreate(target, 400))
  expect(root.state.width()).toBe(360)
  expect(root.state.isResizing()).toBe(true)
  root.state.resizeEnd(pointerEventCreate(target, 400))
  expect(documentState.body.style).toEqual({ cursor: "default", userSelect: "text" })

  root.state.resizeKeyDown({
    key: "ArrowLeft",
    preventDefault: () => undefined,
    shiftKey: true,
  } as unknown as KeyboardEvent)
  expect(root.state.width()).toBe(328)
  root.dispose()
  expect(viewport.listenerCount()).toBe(0)
})

test("resizable sidebar disables resizing and cancels an active drag on mobile", () => {
  const viewport = viewportCreate(900)
  const target = { setPointerCapture: () => undefined } as unknown as HTMLElement
  const root = createRoot((dispose) => ({
    dispose,
    state: resizableSidebarStateCreate({
      defaultWidth: 260,
      maximumWidth: 380,
      minimumWidth: 200,
      storageKey: "test-mobile-sidebar-width",
      viewportEventTarget: viewport as unknown as Window,
    }),
  }))

  root.state.resizeStart(pointerEventCreate(target, 260))
  root.state.resizeMove(pointerEventCreate(target, 300))
  expect(root.state.width()).toBe(300)
  viewport.innerWidth = 760
  viewport.dispatchResize()
  expect(root.state.width()).toBe(260)
  expect(root.state.isResizing()).toBe(false)

  root.state.resizeKeyDown({ key: "ArrowRight", preventDefault: () => undefined, shiftKey: false } as KeyboardEvent)
  expect(root.state.width()).toBe(260)
  root.dispose()
})
