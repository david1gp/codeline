type SessionBranchTreeSession = {
  id: string
  parentSessionId?: string | null
  title: string
  updatedAt: Date | number | string
}

type SessionBranchTreeNode = {
  children: SessionBranchTreeNode[]
  session: SessionBranchTreeSession
}

function sessionUpdatedAtResolve(value: Date | number | string): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === "number") return value
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function sessionBranchTreeNodeCompare(left: SessionBranchTreeNode, right: SessionBranchTreeNode): number {
  const updatedAtDifference =
    sessionUpdatedAtResolve(right.session.updatedAt) - sessionUpdatedAtResolve(left.session.updatedAt)
  if (updatedAtDifference !== 0) return updatedAtDifference
  return right.session.id.localeCompare(left.session.id)
}

export function sessionBranchTreeBuild(sessions: readonly SessionBranchTreeSession[]) {
  const nodes = new Map<string, SessionBranchTreeNode>()
  const parentBySessionId = new Map<string, string>()

  for (const session of sessions) {
    nodes.set(session.id, { children: [], session })
    if (session.parentSessionId !== undefined && session.parentSessionId !== null && session.parentSessionId !== "") {
      parentBySessionId.set(session.id, session.parentSessionId)
    }
  }

  const parentResolve = (sessionId: string): string | null => {
    const visited = new Set<string>([sessionId])
    let parentId = parentBySessionId.get(sessionId)
    let nearestExistingParent: string | null = null
    while (parentId !== undefined) {
      if (visited.has(parentId)) return null
      visited.add(parentId)
      if (nearestExistingParent === null && nodes.has(parentId)) nearestExistingParent = parentId
      parentId = parentBySessionId.get(parentId)
    }
    return nearestExistingParent
  }

  const roots: SessionBranchTreeNode[] = []
  const orphans: SessionBranchTreeNode[] = []
  for (const node of nodes.values()) {
    const parentId = parentResolve(node.session.id)
    if (parentId !== null) {
      nodes.get(parentId)?.children.push(node)
      continue
    }

    roots.push(node)
    if (parentBySessionId.has(node.session.id)) orphans.push(node)
  }

  const sort = (branch: SessionBranchTreeNode[]) => {
    branch.sort(sessionBranchTreeNodeCompare)
    for (const node of branch) sort(node.children)
  }
  sort(roots)
  sort(orphans)

  return { orphans, roots }
}
