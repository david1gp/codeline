import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

type DragConfig = {
  nativeDrag?: boolean
  dropZoneClass?: string
  synthDropZoneClass?: string
}
const dragConfigs = new Map<object, DragConfig>()
const tornDown = new Set<object>()
mock.module("@formkit/drag-and-drop", () => ({
  dragAndDrop: ({ parent, config }: { parent: object; config: DragConfig }) => {
    dragConfigs.set(parent, config)
  },
  tearDown: (parent: object) => {
    tornDown.add(parent)
    dragConfigs.delete(parent)
  },
}))

const { sessionSidebarNewStateCreate } = await import("../../../src/session/ui/sessionSidebarNewStateCreate.js")

test("session drag list keeps native mouse drag and styles synthetic touch drop targets", async () => {
  const parent = {} as HTMLUListElement
  const root = createRoot((dispose) => ({
    dispose,
    state: (() => {
      const state = sessionSidebarNewStateCreate(() => ({ sessions: () => [], isSelected: () => false }) as never)
      state.dragListAttach(parent)
      return state
    })(),
  }))

  try {
    await Promise.resolve()

    expect(dragConfigs.get(parent)).toMatchObject({
      nativeDrag: true,
      dropZoneClass: "sessions-workspace-thread-drop-target",
      synthDropZoneClass: "sessions-workspace-thread-drop-target",
    })
  } finally {
    root.dispose()
  }

  expect(tornDown.has(parent)).toBe(true)
  dragConfigs.clear()
  tornDown.clear()
})
