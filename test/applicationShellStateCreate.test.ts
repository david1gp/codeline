import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { applicationShellStateCreate } from "../src/ui/applicationShellStateCreate.js"

function viewportCreate(innerWidth: number) {
  const listeners = new Set<() => void>()
  return {
    addEventListener: (_type: string, listener: () => void) => void listeners.add(listener),
    dispatchResize: () => {
      listeners.forEach((listener) => {
        listener()
      })
    },
    innerWidth,
    listenerCount: () => listeners.size,
    removeEventListener: (_type: string, listener: () => void) => void listeners.delete(listener),
  }
}

function storageInstall(values: Record<string, string>) {
  const previousStorage = globalThis.localStorage
  const storage = {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value
    },
  }
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
  return () => {
    if (previousStorage === undefined) Reflect.deleteProperty(globalThis, "localStorage")
    else Object.defineProperty(globalThis, "localStorage", { configurable: true, value: previousStorage })
  }
}

function documentCreate() {
  return { body: { style: { cursor: "default", userSelect: "text" } } }
}

function pointerEventCreate(target: HTMLElement, clientX: number, pointerId = 1, button = 0, pointerType = "mouse") {
  return {
    button,
    clientX,
    currentTarget: target,
    pointerId,
    pointerType,
    preventDefault: () => undefined,
  } as unknown as PointerEvent
}

test("application shell manages right-panel availability and open state", () => {
  const root = createRoot((dispose) => ({ dispose, state: applicationShellStateCreate() }))

  expect(root.state.rightPanelAvailable()).toBe(false)
  expect(root.state.rightPanelOpen()).toBe(false)

  root.state.rightPanelEnable()
  root.state.rightPanelToggle()
  expect(root.state.rightPanelAvailable()).toBe(true)
  expect(root.state.rightPanelOpen()).toBe(true)

  root.state.rightPanelDisable()
  expect(root.state.rightPanelAvailable()).toBe(false)
  expect(root.state.rightPanelOpen()).toBe(false)
  root.dispose()
})

test("application shell resizes panels with keyboard controls", () => {
  const root = createRoot((dispose) => ({ dispose, state: applicationShellStateCreate() }))
  let prevented = 0

  root.state.resizeKeyDown("right-panel", {
    key: "ArrowRight",
    preventDefault: () => prevented++,
    shiftKey: false,
  } as unknown as KeyboardEvent)
  expect(root.state.rightPanelWidth()).toBe(548)

  root.state.resizeKeyDown("right-panel", {
    key: "ArrowLeft",
    preventDefault: () => prevented++,
    shiftKey: true,
  } as unknown as KeyboardEvent)
  expect(root.state.rightPanelWidth()).toBe(580)
  expect(prevented).toBe(2)
  root.dispose()
})

test("application shell initializes and persists the session context width within its bounds", () => {
  const restoreStorage = storageInstall({ "codeline-session-context-width": "700" })
  const viewport = viewportCreate(1440)
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationShellStateCreate({ viewportEventTarget: viewport as unknown as Window }),
  }))

  expect(root.state.sessionContextWidth()).toBe(520)
  root.state.resizeKeyDown("session-context", {
    key: "ArrowLeft",
    preventDefault: () => undefined,
    shiftKey: true,
  } as unknown as KeyboardEvent)
  expect(root.state.sessionContextWidth()).toBe(520)

  root.state.resizeKeyDown("session-context", {
    key: "ArrowRight",
    preventDefault: () => undefined,
    shiftKey: true,
  } as unknown as KeyboardEvent)
  expect(root.state.sessionContextWidth()).toBe(488)
  root.state.resizeKeyDown("session-context", {
    key: "ArrowLeft",
    preventDefault: () => undefined,
    shiftKey: false,
  } as unknown as KeyboardEvent)
  expect(root.state.sessionContextWidth()).toBe(500)
  expect(globalThis.localStorage.getItem("codeline-session-context-width")).toBe("500")

  root.dispose()
  restoreStorage()
})

test("session context mirrors pointer and keyboard directions and persists completed pointer drags", () => {
  const values = { "codeline-session-context-width": "320" }
  const restoreStorage = storageInstall(values)
  const viewport = viewportCreate(1440)
  const documentState = documentCreate()
  const target = { setPointerCapture: () => undefined } as unknown as HTMLElement
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationShellStateCreate({
      document: documentState as unknown as Document,
      viewportEventTarget: viewport as unknown as Window,
    }),
  }))

  root.state.resizeStart("session-context", pointerEventCreate(target, 500, 7))
  root.state.resizeMove(pointerEventCreate(target, 450, 8))
  expect(root.state.sessionContextWidth()).toBe(320)
  expect(root.state.isResizing("session-context")).toBe(true)
  root.state.resizeMove(pointerEventCreate(target, 450, 7))
  expect(root.state.sessionContextWidth()).toBe(370)
  root.state.resizeEnd(pointerEventCreate(target, 420, 8))
  expect(root.state.sessionContextWidth()).toBe(370)
  expect(values["codeline-session-context-width"]).toBe("320")
  root.state.resizeMove(pointerEventCreate(target, 420, 7))
  root.state.resizeEnd(pointerEventCreate(target, 420, 7))
  expect(root.state.sessionContextWidth()).toBe(400)
  expect(values["codeline-session-context-width"]).toBe("400")
  expect(root.state.isResizing("session-context")).toBe(false)
  expect(documentState.body.style).toEqual({ cursor: "default", userSelect: "text" })

  root.state.resizeKeyDown("session-context", {
    key: "ArrowRight",
    preventDefault: () => undefined,
    shiftKey: false,
  } as unknown as KeyboardEvent)
  expect(root.state.sessionContextWidth()).toBe(388)
  root.state.resizeKeyDown("session-context", {
    key: "ArrowLeft",
    preventDefault: () => undefined,
    shiftKey: true,
  } as unknown as KeyboardEvent)
  expect(root.state.sessionContextWidth()).toBe(420)
  expect(values["codeline-session-context-width"]).toBe("420")

  root.dispose()
  restoreStorage()
})

test("session context clamps keyboard and pointer resizing to dynamic desktop bounds", () => {
  const restoreStorage = storageInstall({ "codeline-session-context-width": "520" })
  const viewport = viewportCreate(1120)
  const target = { setPointerCapture: () => undefined } as unknown as HTMLElement
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationShellStateCreate({ viewportEventTarget: viewport as unknown as Window }),
  }))

  expect(root.state.sessionContextWidth()).toBe(440)
  root.state.resizeStart("session-context", pointerEventCreate(target, 500))
  root.state.resizeMove(pointerEventCreate(target, -500))
  expect(root.state.sessionContextWidth()).toBe(440)
  root.state.resizeEnd(pointerEventCreate(target, -500))
  expect(root.state.sessionContextWidth()).toBe(440)

  root.state.resizeStart("session-context", pointerEventCreate(target, 500))
  root.state.resizeMove(pointerEventCreate(target, 1000))
  expect(root.state.sessionContextWidth()).toBe(240)
  root.state.resizeEnd(pointerEventCreate(target, 1000))
  expect(root.state.sessionContextWidth()).toBe(240)

  for (let index = 0; index < 20; index += 1) {
    root.state.resizeKeyDown("session-context", {
      key: "ArrowLeft",
      preventDefault: () => undefined,
      shiftKey: true,
    } as unknown as KeyboardEvent)
  }
  expect(root.state.sessionContextWidth()).toBe(440)
  root.dispose()
  restoreStorage()
})

test("application shell keeps the session context width stacked and reapplies it on desktop", () => {
  const restoreStorage = storageInstall({ "codeline-session-context-width": "500" })
  const viewport = viewportCreate(1100)
  let prevented = 0
  let capturedPointer = false
  const target = {
    setPointerCapture: () => {
      capturedPointer = true
    },
  } as unknown as HTMLElement
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationShellStateCreate({ viewportEventTarget: viewport as unknown as Window }),
  }))

  expect(root.state.sessionContextWidth()).toBe(500)
  root.state.resizeKeyDown("session-context", {
    key: "ArrowLeft",
    preventDefault: () => prevented++,
    shiftKey: false,
  } as unknown as KeyboardEvent)
  expect(prevented).toBe(0)
  root.state.resizeStart("session-context", pointerEventCreate(target, 500))
  expect(capturedPointer).toBe(false)
  expect(root.state.isResizing("session-context")).toBe(false)

  viewport.innerWidth = 1150
  viewport.dispatchResize()
  expect(root.state.sessionContextWidth()).toBe(470)
  viewport.innerWidth = 1101
  viewport.dispatchResize()
  expect(root.state.sessionContextWidth()).toBe(421)
  viewport.innerWidth = 1100
  viewport.dispatchResize()
  expect(root.state.sessionContextWidth()).toBe(500)
  viewport.innerWidth = 1300
  viewport.dispatchResize()
  expect(root.state.sessionContextWidth()).toBe(500)

  root.dispose()
  expect(viewport.listenerCount()).toBe(0)
  restoreStorage()
})

test("application shell cancels a session context drag when entering stacked layout", () => {
  const restoreStorage = storageInstall({ "codeline-session-context-width": "400" })
  const viewport = viewportCreate(1200)
  const documentState = documentCreate()
  let capturedPointerId: number | undefined
  const target = {
    setPointerCapture: (pointerId: number) => {
      capturedPointerId = pointerId
    },
  } as unknown as HTMLElement
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationShellStateCreate({
      document: documentState as unknown as Document,
      viewportEventTarget: viewport as unknown as Window,
    }),
  }))

  root.state.resizeStart("session-context", pointerEventCreate(target, 500))
  root.state.resizeMove(pointerEventCreate(target, 450))
  expect(capturedPointerId).toBe(1)
  expect(root.state.sessionContextWidth()).toBe(450)
  expect(root.state.isResizing("session-context")).toBe(true)
  expect(documentState.body.style).toEqual({ cursor: "col-resize", userSelect: "none" })

  viewport.innerWidth = 1100
  viewport.dispatchResize()
  expect(root.state.sessionContextWidth()).toBe(400)
  expect(root.state.isResizing("session-context")).toBe(false)
  expect(documentState.body.style).toEqual({ cursor: "default", userSelect: "text" })
  expect(globalThis.localStorage.getItem("codeline-session-context-width")).toBe("400")

  viewport.innerWidth = 1200
  viewport.dispatchResize()
  expect(root.state.sessionContextWidth()).toBe(400)

  root.dispose()
  restoreStorage()
})

test("application shell cancels session context pointer drags and restores styles without persisting", () => {
  const values = { "codeline-session-context-width": "360" }
  const restoreStorage = storageInstall(values)
  const viewport = viewportCreate(1200)
  const documentState = { body: { style: { cursor: "grab", userSelect: "all" } } }
  const target = { setPointerCapture: () => undefined } as unknown as HTMLElement
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationShellStateCreate({
      document: documentState as unknown as Document,
      viewportEventTarget: viewport as unknown as Window,
    }),
  }))

  root.state.resizeStart("session-context", pointerEventCreate(target, 600))
  root.state.resizeMove(pointerEventCreate(target, 500))
  expect(root.state.sessionContextWidth()).toBe(460)
  root.state.resizeCancel(pointerEventCreate(target, 500))

  expect(root.state.sessionContextWidth()).toBe(360)
  expect(root.state.isResizing("session-context")).toBe(false)
  expect(documentState.body.style).toEqual({ cursor: "grab", userSelect: "all" })
  expect(values["codeline-session-context-width"]).toBe("360")

  root.dispose()
  expect(viewport.listenerCount()).toBe(0)
  restoreStorage()
})

test("application shell cleanup restores document styles during an active session context drag", () => {
  const restoreStorage = storageInstall({ "codeline-session-context-width": "360" })
  const viewport = viewportCreate(1200)
  const documentState = { body: { style: { cursor: "grab", userSelect: "all" } } }
  const target = { setPointerCapture: () => undefined } as unknown as HTMLElement
  const root = createRoot((dispose) => ({
    dispose,
    state: applicationShellStateCreate({
      document: documentState as unknown as Document,
      viewportEventTarget: viewport as unknown as Window,
    }),
  }))

  root.state.resizeStart("session-context", pointerEventCreate(target, 600))
  expect(root.state.isResizing("session-context")).toBe(true)
  root.dispose()

  expect(documentState.body.style).toEqual({ cursor: "grab", userSelect: "all" })
  expect(viewport.listenerCount()).toBe(0)
  restoreStorage()
})
