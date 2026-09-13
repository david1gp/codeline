import type { sessionBranchTreeBuild } from "./sessionBranchTreeBuild.js"

type SessionBranchTree = ReturnType<typeof sessionBranchTreeBuild>
type SessionBranchTreeNode = SessionBranchTree["roots"][number]

function leafIdsCollect(nodes: readonly SessionBranchTreeNode[], leafIds: string[]) {
  for (const node of nodes) {
    if (node.children.length === 0) {
      leafIds.push(node.session.id)
      continue
    }
    leafIdsCollect(node.children, leafIds)
  }
}

export function sessionBranchTreeLeafIdsResolve(roots: readonly SessionBranchTreeNode[]): string[] {
  const leafIds: string[] = []
  leafIdsCollect(roots, leafIds)
  return leafIds
}
