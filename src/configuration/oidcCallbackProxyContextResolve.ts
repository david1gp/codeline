export function oidcCallbackProxyContextResolve(pathname: string): string {
  const escapedPathname = pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return `^${escapedPathname}(?:\\?.*)?$`
}
