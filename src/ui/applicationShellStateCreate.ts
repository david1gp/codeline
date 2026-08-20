import { onCleanup } from "solid-js/dist/solid.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type ApplicationShellPanel = "right-panel" | "sidebar"

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

export function applicationShellStateCreate() {
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
  const rightPanelOpen = signalObjectCreate(false)
  const rightPanelAvailable = signalObjectCreate(false)
  const resizingPanel = signalObjectCreate<ApplicationShellPanel | undefined>(undefined)
  let drag: ApplicationShellDrag | undefined

  const panelBounds = (panel: ApplicationShellPanel) => {
    const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth
    if (panel === "sidebar") {
      const reservedRightWidth = rightPanelOpen.get() && viewportWidth >= 960 ? rightPanelWidth.get() : 0
      return { maximum: Math.min(sidebarMaxWidth, viewportWidth - reservedRightWidth - 420), minimum: sidebarMinWidth }
    }
    return {
      maximum: Math.min(rightPanelMaxWidth, viewportWidth - sidebarWidth.get() - 420),
      minimum: rightPanelMinWidth,
    }
  }
  const panelWidth = (panel: ApplicationShellPanel) =>
    panel === "sidebar" ? sidebarWidth.get() : rightPanelWidth.get()
  const panelWidthCommit = (panel: ApplicationShellPanel, value: number, persist = false) => {
    const bounds = panelBounds(panel)
    const width = widthClamp(value, bounds.minimum, Math.max(bounds.minimum, bounds.maximum))
    const signal = panel === "sidebar" ? sidebarWidth : rightPanelWidth
    signal.set(width)
    if (persist && typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(`codeline-${panel}-width`, String(width))
      } catch {
        // Resizing remains available when persistence is blocked.
      }
    }
  }
  const dragFinish = (pointerId: number) => {
    if (drag === undefined || drag.pointerId !== pointerId) return
    document.body.style.cursor = drag.previousCursor
    document.body.style.userSelect = drag.previousUserSelect
    panelWidthCommit(drag.panel, panelWidth(drag.panel), true)
    resizingPanel.set(undefined)
    drag = undefined
  }
  const resizeStart = (panel: ApplicationShellPanel, event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    event.preventDefault()
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
    drag = {
      panel,
      pointerId: event.pointerId,
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect,
      startWidth: panelWidth(panel),
      startX: event.clientX,
      target,
    }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    resizingPanel.set(panel)
  }
  const resizeMove = (event: PointerEvent) => {
    if (drag === undefined || drag.pointerId !== event.pointerId) return
    const direction = drag.panel === "sidebar" ? 1 : -1
    panelWidthCommit(drag.panel, drag.startWidth + (event.clientX - drag.startX) * direction)
  }
  const resizeKeyDown = (panel: ApplicationShellPanel, event: KeyboardEvent) => {
    const direction = panel === "sidebar" ? 1 : -1
    const step = event.shiftKey ? 32 : 12
    const delta = event.key === "ArrowRight" ? step * direction : event.key === "ArrowLeft" ? -step * direction : 0
    if (delta === 0) return
    event.preventDefault()
    panelWidthCommit(panel, panelWidth(panel) + delta, true)
  }
  const viewportResize = () => {
    if (window.innerWidth >= 761) panelWidthCommit("sidebar", sidebarWidth.get())
    if (window.innerWidth >= 960) panelWidthCommit("right-panel", rightPanelWidth.get())
  }

  if (typeof window !== "undefined") window.addEventListener("resize", viewportResize)
  onCleanup(() => {
    if (typeof window !== "undefined") window.removeEventListener("resize", viewportResize)
    if (drag !== undefined) {
      document.body.style.cursor = drag.previousCursor
      document.body.style.userSelect = drag.previousUserSelect
    }
  })

  return {
    isResizing: (panel: ApplicationShellPanel) => resizingPanel.get() === panel,
    resizeCancel: (event: PointerEvent) => dragFinish(event.pointerId),
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
    sidebarWidth: sidebarWidth.get,
  }
}
