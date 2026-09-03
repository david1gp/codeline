import { pageRouteWorkspace } from "./workspace_url/pageRouteWorkspace.js"

export function primaryNavigationPathIsActive(pathname: string, destination: string): boolean {
  const sectionPath = destination.startsWith(`${pageRouteWorkspace.sessions}/`)
    ? pageRouteWorkspace.sessions
    : destination
  return pathname === sectionPath || pathname.startsWith(`${sectionPath}/`)
}
