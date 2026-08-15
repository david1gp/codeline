import * as v from "valibot"

const permissionActions = new Set(["allow", "ask", "deny"])
const permissionMaxDepth = 8
const permissionMaxEntries = 64
const permissionMaxNodes = 256

export type AgentCatalogPermission = string | { [key: string]: AgentCatalogPermission }

const permissionValueValid = (
  value: unknown,
  depth = 0,
  state: { nodes: number } = { nodes: 0 },
): value is AgentCatalogPermission => {
  state.nodes += 1
  if (state.nodes > permissionMaxNodes) return false
  if (typeof value === "string") return permissionActions.has(value)
  if (typeof value !== "object" || value === null || Array.isArray(value) || depth >= permissionMaxDepth) return false

  const entries = Object.entries(value)
  if (entries.length > permissionMaxEntries) return false
  for (const [key, nested] of entries) {
    if (
      key.length === 0 ||
      key.length > 100 ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype" ||
      !permissionValueValid(nested, depth + 1, state)
    )
      return false
  }
  return true
}

export const agentCatalogPermissionSchema = v.custom<AgentCatalogPermission>(
  (value) => permissionValueValid(value),
  "Permission metadata must contain only bounded nested allow, ask, or deny rules.",
)
