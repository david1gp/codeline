import { createSignalObject } from "@adaptive-ds/solid-ui/utils/createSignalObject"
import { dragAndDrop, tearDown } from "@formkit/drag-and-drop"
import { createEffect, onCleanup, useContext } from "solid-js"
import { applicationAccountContext } from "../../ui/applicationAccountContext.js"
import type { SessionListState } from "./sessionListStateCreate.js"
import { sessionSidebarNewActiveGroupResolve } from "./sessionSidebarNewActiveGroupResolve.js"
import { sessionSidebarNewGroupsDerive } from "./sessionSidebarNewGroupsDerive.js"
import { sessionSidebarNewModeRead } from "./sessionSidebarNewModeRead.js"
import type { SessionSidebarNewMode } from "./sessionSidebarNewModeSchema.js"
import { sessionSidebarNewModeWrite } from "./sessionSidebarNewModeWrite.js"
import { sessionSidebarNewOrderApply } from "./sessionSidebarNewOrderApply.js"
import { sessionSidebarNewOrderMove } from "./sessionSidebarNewOrderMove.js"
import { sessionSidebarNewOrderRead } from "./sessionSidebarNewOrderRead.js"
import { sessionSidebarNewOrderWrite } from "./sessionSidebarNewOrderWrite.js"
import { sessionSidebarNewPersistScheduleCreate } from "./sessionSidebarNewPersistScheduleCreate.js"

export function sessionSidebarNewStateCreate(list: () => SessionListState) {
  const account = useContext(applicationAccountContext)
  const accountId = () => account?.userId() ?? null
  const mode = createSignalObject<SessionSidebarNewMode>(sessionSidebarNewModeRead())
  const order = createSignalObject<string[]>([])
  const expanded = createSignalObject<string[]>([])
  const orderPersistence = sessionSidebarNewPersistScheduleCreate()

  createEffect(() => {
    accountId()
    order.set(sessionSidebarNewOrderRead(accountId()))
  })

  onCleanup(() => {
    orderPersistence.flush()
  })

  const sessions = () => sessionSidebarNewOrderApply(list().sessions(), order.get())
  const groups = () => sessionSidebarNewGroupsDerive(sessions())
  let lastActiveSessionId: string | null = null
  createEffect(() => {
    const currentSessions = sessions()
    const selected = currentSessions.find((session) => list().isSelected(session.id))
    const selectedId = selected?.id ?? null
    if (selectedId === lastActiveSessionId) return
    lastActiveSessionId = selectedId
    if (selectedId === null) return
    const activeGroup = sessionSidebarNewActiveGroupResolve(groups(), selectedId)
    if (activeGroup !== null && !expanded.get().includes(activeGroup)) expanded.set([...expanded.get(), activeGroup])
  })
  const modeChange = (next: SessionSidebarNewMode) => {
    mode.set(next)
    // A mode preference is tiny and a reload can happen before deferred work runs.
    // Persist it synchronously so the next workspace mount observes the selection.
    sessionSidebarNewModeWrite(next)
  }
  const groupToggle = (id: string) => {
    expanded.set(expanded.get().includes(id) ? expanded.get().filter((value) => value !== id) : [...expanded.get(), id])
  }
  const move = (source: string, target: string) => {
    const visible = sessions().map((session) => session.id)
    const previous = order.get().length > 0 ? order.get() : sessionSidebarNewOrderRead(accountId())
    const next = sessionSidebarNewOrderMove(visible, previous, source, target)
    if (next.length === previous.length && next.every((id, index) => id === previous[index])) return
    order.set(next)
    const owner = accountId()
    orderPersistence.schedule(() => {
      sessionSidebarNewOrderWrite(owner, next)
    })
  }
  const moveBy = (id: string, offset: number) => {
    const visible = sessions()
    const index = visible.findIndex((session) => session.id === id)
    const target = visible[index + offset]
    if (target !== undefined) move(id, target.id)
  }
  const moveToOrder = (visibleIds: string[]) => {
    const currentVisibleIds = sessions().map((session) => session.id)
    if (
      visibleIds.length !== currentVisibleIds.length ||
      new Set(visibleIds).size !== currentVisibleIds.length ||
      visibleIds.some((id) => !currentVisibleIds.includes(id))
    )
      return
    const previous = order.get().length > 0 ? order.get() : sessionSidebarNewOrderRead(accountId())
    const visible = new Set(currentVisibleIds)
    const next = [...visibleIds, ...previous.filter((id) => !visible.has(id))]
    if (next.length === previous.length && next.every((id, index) => id === previous[index])) return
    order.set(next)
    const owner = accountId()
    orderPersistence.schedule(() => {
      sessionSidebarNewOrderWrite(owner, next)
    })
  }
  const dragListAttach = (element: HTMLUListElement) => {
    let disposed = false
    queueMicrotask(() => {
      if (disposed) return
      dragAndDrop<string>({
        parent: element,
        getValues: () => sessions().map((session) => session.id),
        // The list/order state remains the only source of truth; FormKit's proposed
        // order is committed through the same account-scoped persistence path.
        setValues: () => {},
        config: {
          nativeDrag: true,
          dragHandle: ".sessions-workspace-drag",
          draggable: (child) => child.hasAttribute("data-session-id"),
          dropZoneClass: "sessions-workspace-thread-drop-target",
          synthDropZoneClass: "sessions-workspace-thread-drop-target",
          onSort: ({ values }) => moveToOrder(values),
        },
      })
    })
    onCleanup(() => {
      disposed = true
      tearDown(element)
    })
  }
  return {
    mode: mode.get,
    modeChange,
    sessions,
    groups,
    expanded: (id: string) => expanded.get().includes(id),
    groupToggle,
    moveBy,
    moveToOrder,
    dragListAttach,
  }
}
