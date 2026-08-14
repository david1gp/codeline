import { createSignal, onCleanup } from "solid-js/dist/solid.js"

type WorkspacePageDocument = {
  activeElement: Element | null
  body: { style: Pick<CSSStyleDeclaration, "overflow"> }
}

type WorkspacePageStateOptions = {
  document?: WorkspacePageDocument
  keyEventTarget?: Pick<Document, "addEventListener" | "removeEventListener">
  mediaQuery?: Pick<MediaQueryList, "matches" | "addEventListener" | "removeEventListener">
  schedule?: (callback: () => void) => void
  viewportEventTarget?: Pick<Window, "addEventListener" | "removeEventListener">
}

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function workspacePageSignalObjectCreate<T>(value: T) {
  const [get, set] = createSignal(value)
  return { get, set }
}

export function workspacePageStateCreate(options: WorkspacePageStateOptions = {}) {
  const documentState = options.document ?? document
  const keyEventTarget = options.keyEventTarget ?? document
  const mediaQuery = options.mediaQuery ?? window.matchMedia("(min-width: 761px)")
  const schedule = options.schedule ?? queueMicrotask
  const viewportEventTarget = options.viewportEventTarget ?? window
  const isSessionDrawerOpen = workspacePageSignalObjectCreate(false)
  let drawer: HTMLElement | undefined
  let initialFocus: HTMLElement | undefined
  let trigger: HTMLElement | undefined
  let previousBodyOverflow: string | undefined

  const drawerReferencesRelease = () => {
    drawer = undefined
    initialFocus = undefined
    trigger = undefined
  }
  const bodyScrollRelease = () => {
    if (previousBodyOverflow === undefined) return
    documentState.body.style.overflow = previousBodyOverflow
    previousBodyOverflow = undefined
  }
  const sessionDrawerClose = () => {
    const focusTarget = isSessionDrawerOpen.get() ? trigger : undefined
    isSessionDrawerOpen.set(false)
    bodyScrollRelease()
    drawerReferencesRelease()
    focusTarget?.focus()
  }
  const keydownHandle = (event: KeyboardEvent) => {
    if (!isSessionDrawerOpen.get()) return
    if (event.key === "Escape") {
      event.preventDefault()
      sessionDrawerClose()
      return
    }
    if (event.key !== "Tab" || drawer === undefined) return

    const controls = [...drawer.querySelectorAll<HTMLElement>(focusableSelector)].filter(
      (element) => element.tabIndex >= 0,
    )
    const first = controls[0]
    const last = controls.at(-1)
    if (first === undefined || last === undefined) {
      event.preventDefault()
      drawer.focus()
      return
    }

    const activeElement = documentState.activeElement
    if (event.shiftKey && (activeElement === first || !drawer.contains(activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (activeElement === last || !drawer.contains(activeElement))) {
      event.preventDefault()
      first.focus()
    }
  }
  const desktopClose = () => {
    if (mediaQuery.matches) sessionDrawerClose()
  }

  keyEventTarget.addEventListener("keydown", keydownHandle)
  mediaQuery.addEventListener("change", desktopClose)
  viewportEventTarget.addEventListener("resize", desktopClose)
  viewportEventTarget.addEventListener("orientationchange", desktopClose)
  onCleanup(() => {
    keyEventTarget.removeEventListener("keydown", keydownHandle)
    mediaQuery.removeEventListener("change", desktopClose)
    viewportEventTarget.removeEventListener("resize", desktopClose)
    viewportEventTarget.removeEventListener("orientationchange", desktopClose)
    isSessionDrawerOpen.set(false)
    bodyScrollRelease()
    drawerReferencesRelease()
  })

  return {
    isSessionDrawerOpen: isSessionDrawerOpen.get,
    sessionDrawerClose,
    sessionDrawerElement: (element: HTMLElement) => {
      drawer = element
    },
    sessionDrawerInitialFocus: (element: HTMLElement) => {
      initialFocus = element
      schedule(() => {
        if (isSessionDrawerOpen.get() && initialFocus === element) element.focus()
      })
    },
    sessionDrawerOpen: (element?: HTMLElement) => {
      if (mediaQuery.matches || isSessionDrawerOpen.get()) return
      trigger = element
      previousBodyOverflow = documentState.body.style.overflow
      documentState.body.style.overflow = "hidden"
      isSessionDrawerOpen.set(true)
    },
    sessionSelectHandle: sessionDrawerClose,
  }
}
