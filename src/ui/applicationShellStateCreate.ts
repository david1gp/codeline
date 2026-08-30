import { onCleanup } from "solid-js/dist/solid.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type ApplicationShellPanel = "right-panel" | "session-context" | "sidebar"

type ApplicationShellStateOptions = {
  document?: Pick<Document, "body">
  viewportEventTarget?: Pick<Window, "addEventListener" | "innerWidth" | "removeEventListener">
}

type ApplicationShellDrag = {
  panel: ApplicationShellPanel
  pointerId: number
  previousCursor: string
  previousUserSelect: string
  startWidth: number
  startX: number
  target: HTMLElement
}

const sidebarDefaultWidth = 260
const sidebarMinWidth = 180
const sidebarMaxWidth = 480
const rightPanelDefaultWidth = 560
const rightPanelMinWidth = 300
const rightPanelMaxWidth = 1200
const sessionContextDefaultWidth = 320
const sessionContextMinWidth = 240
const sessionContextMaxWidth = 520
const sessionContextBreakpoint = 1100

function widthClamp(value: number, minimum: number, maximum: number) {
  return Math.round(Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum)))
}

function storedWidthRead(key: string, fallback: number) {
  if (typeof localStorage === "undefined") return fallback
  try {
    const value = Number.parseInt(localStorage.getItem(key) ?? "", 10)
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function applicationShellStateCreate(options: ApplicationShellStateOptions = {}) {
  const documentState = options.document ?? (typeof document === "undefined" ? undefined : document)
  const viewportEventTarget = options.viewportEventTarget ?? (typeof window === "undefined" ? undefined : window)
  const sidebarWidth = signalObjectCreate(
    widthClamp(storedWidthRead("codeline-sidebar-width", sidebarDefaultWidth), sidebarMinWidth, sidebarMaxWidth),
  )
  const rightPanelWidth = signalObjectCreate(
    widthClamp(
      storedWidthRead("codeline-right-panel-width", rightPanelDefaultWidth),
      rightPanelMinWidth,
      rightPanelMaxWidth,
    ),
  )
  const sessionContextStoredWidth = signalObjectCreate(
    widthClamp(
      storedWidthRead("codeline-session-context-width", sessionContextDefaultWidth),
      sessionContextMinWidth,
      sessionContextMaxWidth,
    ),
  )
  const rightPanelOpen = signalObjectCreate(false)
  const rightPanelAvailable = signalObjectCreate(false)
  const resizingPanel = signalObjectCreate<ApplicationShellPanel | undefined>(undefined)
  let drag: ApplicationShellDrag | undefined

  const viewportWidthRead = () => viewportEventTarget?.innerWidth ?? 1440
  const sessionContextIsDesktop = () => viewportWidthRead() > sessionContextBreakpoint
  let sessionContextWasDesktop = sessionContextIsDesktop()

  const panelBounds = (panel: ApplicationShellPanel) => {
    const viewportWidth = viewportWidthRead()
    if (panel === "sidebar") {
      const reservedRightWidth = rightPanelOpen.get() && viewportWidth >= 960 ? rightPanelWidth.get() : 0
      return { maximum: Math.min(sidebarMaxWidth, viewportWidth - reservedRightWidth - 420), minimum: sidebarMinWidth }
    }
    if (panel === "session-context") {
      if (!sessionContextIsDesktop()) {
        return { maximum: sessionContextMaxWidth, minimum: sessionContextMinWidth }
      }
      return {
        maximum: Math.min(sessionContextMaxWidth, viewportWidth - sidebarWidth.get() - 420),
        minimum: sessionContextMinWidth,
      }
    }
    return {
      maximum: Math.min(rightPanelMaxWidth, viewportWidth - sidebarWidth.get() - 420),
      minimum: rightPanelMinWidth,
    }
  }
  const sessionContextWidth = signalObjectCreate(sessionContextStoredWidth.get())
  if (sessionContextIsDesktop()) {
    const bounds = panelBounds("session-context")
    sessionContextWidth.set(
      widthClamp(sessionContextWidth.get(), bounds.minimum, Math.max(bounds.minimum, bounds.maximum)),
    )
  }
  const panelWidth = (panel: ApplicationShellPanel) =>
    panel === "sidebar"
      ? sidebarWidth.get()
      : panel === "right-panel"
        ? rightPanelWidth.get()
        : sessionContextWidth.get()
  const panelWidthCommit = (panel: ApplicationShellPanel, value: number, persist = false) => {
    const bounds = panelBounds(panel)
    const width = widthClamp(value, bounds.minimum, Math.max(bounds.minimum, bounds.maximum))
    const signal = panel === "sidebar" ? sidebarWidth : panel === "right-panel" ? rightPanelWidth : sessionContextWidth
    signal.set(width)
    if (persist && panel === "session-context") sessionContextStoredWidth.set(width)
    if (persist && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`codeline-${panel}-width`, String(width))
      } catch {
        // Resizing remains available when persistence is blocked.
      }
    }
  }
  const sessionContextDragCancel = () => {
    if (drag?.panel !== "session-context") return false
    const canceledDrag = drag
    const width = canceledDrag.startWidth
    if (documentState !== undefined) {
      documentState.body.style.cursor = canceledDrag.previousCursor
      documentState.body.style.userSelect = canceledDrag.previousUserSelect
    }
    drag = undefined
    resizingPanel.set(undefined)
    sessionContextWidth.set(width)
    return true
  }
  const dragFinish = (pointerId: number) => {
    if (drag === undefined || drag.pointerId !== pointerId) return
    if (drag.panel === "session-context" && !sessionContextIsDesktop()) {
      sessionContextDragCancel()
      return
    }
    if (documentState !== undefined) {
      documentState.body.style.cursor = drag.previousCursor
      documentState.body.style.userSelect = drag.previousUserSelect
    }
    panelWidthCommit(drag.panel, panelWidth(drag.panel), true)
    resizingPanel.set(undefined)
    drag = undefined
  }
  const resizeStart = (panel: ApplicationShellPanel, event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (panel === "session-context" && !sessionContextIsDesktop()) return
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    drag = {
      panel,
      pointerId: event.pointerId,
      previousCursor: documentState?.body.style.cursor ?? "",
      previousUserSelect: documentState?.body.style.userSelect ?? "",
      startWidth: panelWidth(panel),
      startX: event.clientX,
      target,
    }
    if (documentState !== undefined) {
      documentState.body.style.cursor = "col-resize"
      documentState.body.style.userSelect = "none"
    }
    resizingPanel.set(panel)
  }
  const resizeMove = (event: PointerEvent) => {
    if (drag === undefined || drag.pointerId !== event.pointerId) return
    if (drag.panel === "session-context" && !sessionContextIsDesktop()) {
      sessionContextDragCancel()
      return
    }
    const direction = drag.panel === "sidebar" ? 1 : -1
    panelWidthCommit(drag.panel, drag.startWidth + (event.clientX - drag.startX) * direction)
  }
  const resizeKeyDown = (panel: ApplicationShellPanel, event: KeyboardEvent) => {
    if (panel === "session-context" && !sessionContextIsDesktop()) return
    const direction = panel === "sidebar" ? 1 : -1
    const step = event.shiftKey ? 32 : 12
    const delta = event.key === "ArrowRight" ? step * direction : event.key === "ArrowLeft" ? -step * direction : 0
    if (delta === 0) return
    event.preventDefault()
    panelWidthCommit(panel, panelWidth(panel) + delta, true)
  }
  const viewportResize = () => {
    const isDesktop = sessionContextIsDesktop()
    if (sessionContextWasDesktop && !isDesktop) {
      const contextDragCanceled = sessionContextDragCancel()
      if (!contextDragCanceled) sessionContextWidth.set(sessionContextStoredWidth.get())
    }
    if (!sessionContextWasDesktop && isDesktop) {
      panelWidthCommit("session-context", sessionContextStoredWidth.get())
    }
    sessionContextWasDesktop = isDesktop
    if (viewportWidthRead() >= 761) panelWidthCommit("sidebar", sidebarWidth.get())
    if (viewportWidthRead() >= 960) panelWidthCommit("right-panel", rightPanelWidth.get())
    if (isDesktop) panelWidthCommit("session-context", panelWidth("session-context"))
  }

  if (viewportEventTarget !== undefined) viewportEventTarget.addEventListener("resize", viewportResize)
  onCleanup(() => {
    viewportEventTarget?.removeEventListener("resize", viewportResize)
    if (drag !== undefined) {
      if (documentState !== undefined) {
        documentState.body.style.cursor = drag.previousCursor
        documentState.body.style.userSelect = drag.previousUserSelect
      }
      drag = undefined
      resizingPanel.set(undefined)
    }
  })

  return {
    isResizing: (panel: ApplicationShellPanel) => resizingPanel.get() === panel,
    resizeCancel: (event: PointerEvent) => {
      if (drag?.panel === "session-context") {
        sessionContextDragCancel()
        return
      }
      dragFinish(event.pointerId)
    },
    resizeEnd: (event: PointerEvent) => dragFinish(event.pointerId),
    resizeKeyDown,
    resizeMove,
    resizeStart,
    rightPanelAvailable: rightPanelAvailable.get,
    rightPanelClose: () => rightPanelOpen.set(false),
    rightPanelDisable: () => {
      rightPanelAvailable.set(false)
      rightPanelOpen.set(false)
    },
    rightPanelEnable: () => rightPanelAvailable.set(true),
    rightPanelOpen: rightPanelOpen.get,
    rightPanelShow: () => rightPanelOpen.set(true),
    rightPanelToggle: () => rightPanelOpen.set(!rightPanelOpen.get()),
    rightPanelWidth: rightPanelWidth.get,
    sessionContextWidth: sessionContextWidth.get,
    sidebarWidth: sidebarWidth.get,
  }
}
