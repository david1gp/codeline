import * as solidRuntime from "solid-js/dist/solid.js"
import { sessionBranchTreeBuild } from "./sessionBranchTreeBuild.js"
import { sessionBranchTreeLeafIdsResolve } from "./sessionBranchTreeLeafIdsResolve.js"
import { sessionBranchTreeLeafSelectionResolve } from "./sessionBranchTreeLeafSelectionResolve.js"
import { sessionBranchTreeSelectedAncestryResolve } from "./sessionBranchTreeSelectedAncestryResolve.js"

const { createMemo, createSignal } = solidRuntime as unknown as Pick<
  typeof import("solid-js"),
  "createMemo" | "createSignal"
>

type SessionBranchTreeStateOptions = {
  selectedSessionId?: () => string | null
  sessions: () => Parameters<typeof sessionBranchTreeBuild>[0]
}

export function sessionBranchTreeStateCreate(options: SessionBranchTreeStateOptions) {
  const tree = createMemo(() => sessionBranchTreeBuild(options.sessions()))
  const [selectedLeafIdGet, selectedLeafIdSet] = createSignal<string | null>(null)
  const selectedLeafId = { get: selectedLeafIdGet, set: selectedLeafIdSet }
  const selectedSessionId = options.selectedSessionId ?? (() => null)

  const leafIds = () => sessionBranchTreeLeafIdsResolve(tree().roots)
  const activeLeafId = () => sessionBranchTreeLeafSelectionResolve(tree().roots, selectedLeafId.get())
  const selectedBranchId = () => activeLeafId() ?? selectedSessionId()

  return {
    activeLeafId,
    isLeaf: (sessionId: string) => leafIds().includes(sessionId),
    leafIds,
    orphans: () => tree().orphans,
    roots: () => tree().roots,
    selectedAncestry: () => sessionBranchTreeSelectedAncestryResolve(tree().roots, selectedBranchId()),
    selectLeaf: (sessionId: string | null) => {
      if (sessionId === null) {
        selectedLeafId.set(null)
        return
      }
      const selected = sessionBranchTreeLeafSelectionResolve(tree().roots, sessionId)
      if (selected !== null) selectedLeafId.set(selected)
    },
    tree,
  }
}
