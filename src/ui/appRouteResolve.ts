export function appRouteResolve(pathname: string): "files" | "note" | "notes" | "notes-new" | "settings" | "workspace" {
  if (pathname === "/files") return "files"
  if (pathname === "/settings") return "settings"
  if (pathname === "/notes/new") return "notes-new"
  if (pathname === "/notes") return "notes"
  if (pathname.startsWith("/notes/") && pathname.slice("/notes/".length) !== "") return "note"
  return "workspace"
}
