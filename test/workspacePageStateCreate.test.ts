import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { workspacePageStateCreate } from "../src/ui/workspacePageStateCreate.js"

function eventTargetCreate() {
  const listeners = new Map<string, Set<(event: Event) => void>>()
  return {
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const registered = listeners.get(type) ?? new Set()
      registered.add(listener)
      listeners.set(type, registered)
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => void listeners.get(type)?.delete(listener),
    dispatch: (type: string, event: Event = {} as Event) =>
      listeners.get(type)?.forEach((listener) => void listener(event)),
    listenerCount: () => [...listeners.values()].reduce((count, registered) => count + registered.size, 0),
  }
}

function stateDependenciesCreate() {
  const keyEvents = eventTargetCreate()
  const viewportEvents = eventTargetCreate()
  const mediaEvents = eventTargetCreate()
  const mediaQuery = { ...mediaEvents, matches: false }
  const documentState = { activeElement: null as Element | null, body: { style: { overflow: "auto" } } }
  const scheduled: Array<() => void> = []
  return {
    documentState,
    keyEvents,
    mediaQuery,
    scheduled,
    viewportEvents,
    options: {
      document: documentState,
      keyEventTarget: keyEvents as unknown as Document,
      mediaQuery: mediaQuery as unknown as MediaQueryList,
      schedule: (callback: () => void) => void scheduled.push(callback),
      viewportEventTarget: viewportEvents as unknown as Window,
    },
  }
}

test("workspace session drawer shares close behavior and restores trigger focus and body scrolling", () => {
  const dependencies = stateDependenciesCreate()
  let firstTriggerFocusCount = 0
  let secondTriggerFocusCount = 0
  const dispose = createRoot((rootDispose) => {
    const state = workspacePageStateCreate(dependencies.options)
    expect(state.sessionDrawerOpen({ focus: () => firstTriggerFocusCount++ } as unknown as HTMLElement)).toBe(true)
    expect(state.isSessionDrawerOpen()).toBe(true)
    expect(dependencies.documentState.body.style.overflow).toBe("hidden")
    expect(state.sessionDrawerOpen()).toBe(true)

    state.sessionSelectHandle()
    expect(state.isSessionDrawerOpen()).toBe(false)
    expect(dependencies.documentState.body.style.overflow).toBe("auto")
    expect(firstTriggerFocusCount).toBe(1)

    state.sessionDrawerOpen({ focus: () => secondTriggerFocusCount++ } as unknown as HTMLElement)
    state.sessionDrawerClose()
    expect(firstTriggerFocusCount).toBe(1)
    expect(secondTriggerFocusCount).toBe(1)
    return rootDispose
  })

  dispose()
  expect(dependencies.keyEvents.listenerCount()).toBe(0)
  expect(dependencies.mediaQuery.listenerCount()).toBe(0)
  expect(dependencies.viewportEvents.listenerCount()).toBe(0)
})

test("workspace session drawer leaves desktop navigation unhandled", () => {
  const dependencies = stateDependenciesCreate()
  dependencies.mediaQuery.matches = true
  createRoot((dispose) => {
    const state = workspacePageStateCreate(dependencies.options)

    expect(state.sessionDrawerOpen()).toBe(false)
    expect(state.isSessionDrawerOpen()).toBe(false)
    expect(dependencies.documentState.body.style.overflow).toBe("auto")
    dispose()
  })
})

test("workspace session drawer focuses only a current open drawer control", () => {
  const dependencies = stateDependenciesCreate()
  let focusCount = 0
  const root = createRoot((dispose) => ({ dispose, state: workspacePageStateCreate(dependencies.options) }))
  const control = { focus: () => focusCount++ } as unknown as HTMLElement

  root.state.sessionDrawerOpen()
  root.state.sessionDrawerInitialFocus(control)
  root.state.sessionDrawerClose()
  dependencies.scheduled.shift()?.()
  expect(focusCount).toBe(0)

  root.state.sessionDrawerOpen()
  root.state.sessionDrawerInitialFocus(control)
  dependencies.scheduled.shift()?.()
  expect(focusCount).toBe(1)
  root.dispose()
  expect(dependencies.documentState.body.style.overflow).toBe("auto")
})

test("workspace session drawer ignores other keys and closes on Escape", () => {
  const dependencies = stateDependenciesCreate()
  createRoot((dispose) => {
    const state = workspacePageStateCreate(dependencies.options)
    state.sessionDrawerOpen()
    dependencies.keyEvents.dispatch("keydown", { key: "Enter", preventDefault: () => undefined } as KeyboardEvent)
    expect(state.isSessionDrawerOpen()).toBe(true)

    let wasPrevented = false
    dependencies.keyEvents.dispatch("keydown", {
      key: "Escape",
      preventDefault: () => {
        wasPrevented = true
      },
    } as KeyboardEvent)
    expect(state.isSessionDrawerOpen()).toBe(false)
    expect(wasPrevented).toBe(true)
    dispose()
  })
})

test("workspace session drawer traps forward and reverse Tab focus", () => {
  const dependencies = stateDependenciesCreate()
  let firstFocusCount = 0
  let lastFocusCount = 0
  const first = { focus: () => firstFocusCount++, tabIndex: 0 } as unknown as HTMLElement
  const last = { focus: () => lastFocusCount++, tabIndex: 0 } as unknown as HTMLElement
  const controls = [first, last]
  const drawer = {
    contains: (element: Element | null) => controls.includes(element as HTMLElement),
    focus: () => undefined,
    querySelectorAll: () => controls,
  } as unknown as HTMLElement
  const root = createRoot((dispose) => ({ dispose, state: workspacePageStateCreate(dependencies.options) }))
  root.state.sessionDrawerOpen()
  root.state.sessionDrawerElement(drawer)

  let preventCount = 0
  dependencies.documentState.activeElement = last
  dependencies.keyEvents.dispatch("keydown", {
    key: "Tab",
    shiftKey: false,
    preventDefault: () => preventCount++,
  } as unknown as KeyboardEvent)
  dependencies.documentState.activeElement = first
  dependencies.keyEvents.dispatch("keydown", {
    key: "Tab",
    shiftKey: true,
    preventDefault: () => preventCount++,
  } as unknown as KeyboardEvent)

  expect(firstFocusCount).toBe(1)
  expect(lastFocusCount).toBe(1)
  expect(preventCount).toBe(2)
  root.dispose()
})

test("workspace session drawer wraps Tab when focus starts outside the drawer", () => {
  const dependencies = stateDependenciesCreate()
  let firstFocusCount = 0
  let lastFocusCount = 0
  const first = { focus: () => firstFocusCount++, tabIndex: 0 } as unknown as HTMLElement
  const last = { focus: () => lastFocusCount++, tabIndex: 0 } as unknown as HTMLElement
  const drawer = {
    contains: (element: Element | null) => [first, last].includes(element as HTMLElement),
    focus: () => undefined,
    querySelectorAll: () => [first, last],
  } as unknown as HTMLElement
  const outside = {} as Element
  const root = createRoot((dispose) => ({ dispose, state: workspacePageStateCreate(dependencies.options) }))
  root.state.sessionDrawerOpen()
  root.state.sessionDrawerElement(drawer)

  let preventCount = 0
  dependencies.documentState.activeElement = outside
  dependencies.keyEvents.dispatch("keydown", {
    key: "Tab",
    shiftKey: false,
    preventDefault: () => preventCount++,
  } as unknown as KeyboardEvent)
  dependencies.documentState.activeElement = outside
  dependencies.keyEvents.dispatch("keydown", {
    key: "Tab",
    shiftKey: true,
    preventDefault: () => preventCount++,
  } as unknown as KeyboardEvent)

  expect(firstFocusCount).toBe(1)
  expect(lastFocusCount).toBe(1)
  expect(preventCount).toBe(2)
  root.dispose()
})

test("workspace session drawer closes on desktop resize, orientation, and media changes", () => {
  const dependencies = stateDependenciesCreate()
  const root = createRoot((dispose) => ({ dispose, state: workspacePageStateCreate(dependencies.options) }))

  root.state.sessionDrawerOpen()
  dependencies.mediaQuery.matches = true
  dependencies.viewportEvents.dispatch("resize")
  expect(root.state.isSessionDrawerOpen()).toBe(false)

  dependencies.mediaQuery.matches = false
  root.state.sessionDrawerOpen()
  dependencies.mediaQuery.matches = true
  dependencies.viewportEvents.dispatch("orientationchange")
  expect(root.state.isSessionDrawerOpen()).toBe(false)

  dependencies.mediaQuery.matches = false
  root.state.sessionDrawerOpen()
  dependencies.mediaQuery.matches = true
  dependencies.mediaQuery.dispatch("change")
  expect(root.state.isSessionDrawerOpen()).toBe(false)
  root.dispose()
})
