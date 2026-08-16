export function primaryNavigationPathIsActive(pathname: string, destination: string): boolean {
  const sectionPath = destination.startsWith("/sessions/") ? "/sessions" : destination
  return pathname === sectionPath || pathname.startsWith(`${sectionPath}/`)
}
