import { onCleanup } from "solid-js/dist/solid.js"
import { signalObjectCreate } from "./signalObjectCreate.js"

type ResizableSidebarStateOptions = {
  defaultWidth: number
  maximumWidth: number
  minimumWidth: number
  storageKey: string
  document?: Pick<Document, "body">
  viewportEventTarget?: Pick<Window, "addEventListener" | "innerWidth" | "removeEventListener">
}

type ResizableSidebarDrag = {
  pointerId: number
  previousCursor: string
  previousUserSelect: string
  startWidth: number
  startX: number
}

const contentMinimumWidth = 420
const mobileBreakpoint = 760

function widthClamp(value: number, minimum: number, maximum: number) {
  return Math.round(Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum)))
}

export function resizableSidebarStateCreate(options: ResizableSidebarStateOptions) {
  const documentState = options.document ?? (typeof document === "undefined" ? undefined : document)
  const viewportEventTarget = options.viewportEventTarget ?? (typeof window === "undefined" ? undefined : window)
  const viewportWidthRead = () => viewportEventTarget?.innerWidth ?? 1440
  const maximumWidth = () =>
    Math.max(options.minimumWidth, Math.min(options.maximumWidth, viewportWidthRead() - contentMinimumWidth))
  const storedWidthRead = () => {
    if (typeof localStorage === "undefined") return options.defaultWidth
    try {
      const value = Number.parseInt(localStorage.getItem(options.storageKey) ?? "", 10)
      return Number.isFinite(value) ? value : options.defaultWidth
    } catch {
      return options.defaultWidth
    }
  }
  const width = signalObjectCreate(widthClamp(storedWidthRead(), options.minimumWidth, maximumWidth()))
  const resizing = signalObjectCreate(false)
  let drag: ResizableSidebarDrag | undefined

  const widthCommit = (value: number, persist = false) => {
    width.set(widthClamp(value, options.minimumWidth, maximumWidth()))
    if (!persist || typeof localStorage === "undefined") return
    try {
      localStorage.setItem(options.storageKey, String(width.get()))
    } catch {
      // Resizing remains available when persistence is blocked.
    }
  }
  const dragFinish = (pointerId: number, canceled = false) => {
    if (drag === undefined || drag.pointerId !== pointerId) return
    const finishedDrag = drag
    if (documentState !== undefined) {
      documentState.body.style.cursor = finishedDrag.previousCursor
      documentState.body.style.userSelect = finishedDrag.previousUserSelect
    }
    drag = undefined
    resizing.set(false)
    widthCommit(canceled ? finishedDrag.startWidth : width.get(), !canceled)
  }
  const viewportResize = () => {
    if (viewportWidthRead() <= mobileBreakpoint && drag !== undefined) {
      dragFinish(drag.pointerId, true)
      return
    }
    widthCommit(width.get())
  }

  viewportEventTarget?.addEventListener("resize", viewportResize)
  onCleanup(() => {
    viewportEventTarget?.removeEventListener("resize", viewportResize)
    if (drag === undefined) return
    if (documentState !== undefined) {
      documentState.body.style.cursor = drag.previousCursor
      documentState.body.style.userSelect = drag.previousUserSelect
    }
    drag = undefined
    resizing.set(false)
  })

  return {
    isResizing: resizing.get,
    maximumWidth,
    minimumWidth: () => options.minimumWidth,
    resizeCancel: (event: PointerEvent) => dragFinish(event.pointerId, true),
    resizeEnd: (event: PointerEvent) => dragFinish(event.pointerId),
    resizeKeyDown: (event: KeyboardEvent) => {
      if (viewportWidthRead() <= mobileBreakpoint) return
      const step = event.shiftKey ? 32 : 12
      const delta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0
      if (delta === 0) return
      event.preventDefault()
      widthCommit(width.get() + delta, true)
    },
    resizeMove: (event: PointerEvent) => {
      if (drag === undefined || drag.pointerId !== event.pointerId) return
      widthCommit(drag.startWidth + event.clientX - drag.startX)
    },
    resizeStart: (event: PointerEvent) => {
      if (viewportWidthRead() <= mobileBreakpoint || (event.pointerType === "mouse" && event.button !== 0)) return
      event.preventDefault()
      ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      drag = {
        pointerId: event.pointerId,
        previousCursor: documentState?.body.style.cursor ?? "",
        previousUserSelect: documentState?.body.style.userSelect ?? "",
        startWidth: width.get(),
        startX: event.clientX,
      }
      if (documentState !== undefined) {
        documentState.body.style.cursor = "col-resize"
        documentState.body.style.userSelect = "none"
      }
      resizing.set(true)
    },
    width: width.get,
  }
}
