export function workspaceRouteFamilyResolve(pathname: string): "legacy" | "sessions" {
  if (pathname === "/sessions-legacy" || pathname.startsWith("/sessions-legacy/")) return "legacy"
  return "sessions"
}
