import type { sessionBranchTreeBuild } from "./sessionBranchTreeBuild.js"
import { sessionBranchTreeLeafIdsResolve } from "./sessionBranchTreeLeafIdsResolve.js"

type SessionBranchTree = ReturnType<typeof sessionBranchTreeBuild>
type SessionBranchTreeNode = SessionBranchTree["roots"][number]

export function sessionBranchTreeLeafSelectionResolve(
  roots: readonly SessionBranchTreeNode[],
  selectedSessionId: string | null,
): string | null {
  if (selectedSessionId === null) return null
  return sessionBranchTreeLeafIdsResolve(roots).includes(selectedSessionId) ? selectedSessionId : null
}
