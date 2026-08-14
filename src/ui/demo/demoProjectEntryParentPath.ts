/** Resolves the containing directory of a fixture entry path, "" for the project root. */
export function demoProjectEntryParentPath(path: string): string {
  if (!path.includes("/")) return ""
  return path.slice(0, path.lastIndexOf("/"))
}
