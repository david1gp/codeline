import type { sessionBranchTreeBuild } from "./sessionBranchTreeBuild.js"

type SessionBranchTree = ReturnType<typeof sessionBranchTreeBuild>
type SessionBranchTreeNode = SessionBranchTree["roots"][number]

function ancestrySearch(
  nodes: readonly SessionBranchTreeNode[],
  selectedSessionId: string,
  ancestry: readonly string[],
): string[] | null {
  for (const node of nodes) {
    const nextAncestry = [...ancestry, node.session.id]
    if (node.session.id === selectedSessionId) return nextAncestry
    const found = ancestrySearch(node.children, selectedSessionId, nextAncestry)
    if (found !== null) return found
  }
  return null
}

export function sessionBranchTreeSelectedAncestryResolve(
  roots: readonly SessionBranchTreeNode[],
  selectedSessionId: string | null,
): string[] {
  if (selectedSessionId === null) return []
  return ancestrySearch(roots, selectedSessionId, []) ?? []
}
