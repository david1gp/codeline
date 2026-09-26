export function sessionSidebarProjectLabelResolve(projectPath: string): string {
  if (projectPath === "~") return "Home"
  const segments = projectPath.split("/").filter((segment) => segment.length > 0)
  return segments.at(-1) ?? projectPath
}
